/**
 * @module defineTable
 *
 * The core schema DSL. Defines a database table with co-located column metadata
 * (types, mutability, visibility, validation, sanitization), an index DSL, and
 * optional constraints. Produces a TableDef containing the real Drizzle table,
 * derived access sets, and auto-generated schemas.
 *
 * Three call signatures:
 *
 * @example
 * // 1. Direct call — auto-loads dialect from storium.config.ts
 * const users = defineTable('users', {
 *   id:    { type: 'uuid', primaryKey: true, default: 'random_uuid' },
 *   email: { type: 'varchar', maxLength: 255, notNull: true, mutable: true },
 * })
 *
 * @example
 * // 2. Curried with explicit dialect
 * const users = defineTable('postgresql')('users', { ... })
 *
 * @example
 * // 3. No-arg — auto-loads dialect, returns reusable bound function
 * const dt = defineTable()
 * const users = dt('users', { ... })
 * const projects = dt('projects', { ... })
 */

import type {
  Dialect,
  ColumnsConfig,
  TableOptions,
  TableDef,
  TableAccess,
  SchemaSet,
  AssertionRegistry,
} from './types'
import { isRawColumn } from './types'
import { SchemaError } from './errors'
import { getDialectMapping, buildDslColumn } from './dialect'
import { buildIndexes } from './indexes'
import { buildSchemaSet } from './runtimeSchema'
import { loadDialectFromConfig } from './configLoader'

// ------------------------------------------------------------ Helpers --

/**
 * Inject timestamp columns if `timestamps: true` is set in options.
 * Adds `created_at` and `updated_at` unless they're already defined.
 */
const injectTimestamps = (columns: ColumnsConfig): ColumnsConfig => {
  const result = { ...columns }

  if (!('created_at' in result)) {
    result.created_at = {
      type: 'timestamp',
      notNull: true,
      default: 'now',
    }
  }

  if (!('updated_at' in result)) {
    result.updated_at = {
      type: 'timestamp',
      notNull: true,
      default: 'now',
    }
  }

  return result
}

/**
 * Derive access sets from column configs.
 */
const deriveAccess = (columns: ColumnsConfig): TableAccess => {
  const allKeys = Object.keys(columns)

  // Guard invalid column config combinations at definition time.
  for (const key of allKeys) {
    const col = columns[key]

    // required + mutable:false is a contradiction. A required column
    // that can never be written is impossible to satisfy. Use required:true
    // alone (omit mutable) for insert-only fields.
    if (col?.required === true && col?.mutable === false) {
      throw new SchemaError(
        `Column '${key}': a column cannot be both \`required: true\` and \`mutable: false\`. ` +
        'Use \`required: true\` alone (omit \`mutable\`) for insert-only fields.'
      )
    }

    // required + writeOnly is a contradiction. A write-only column is excluded
    // from SELECT results entirely — it has no meaningful "required" presence.
    if (col?.required === true && col?.writeOnly === true) {
      throw new SchemaError(
        `Column '${key}': a column cannot be both \`required: true\` and \`writeOnly: true\`. ` +
        'A write-only column is excluded from SELECT results and cannot be meaningfully required.'
      )
    }
  }

  const writeOnly = allKeys.filter(k => columns[k]?.writeOnly === true)
  const selectable = allKeys.filter(k => !columns[k]?.writeOnly)
  const mutable = allKeys.filter(k => columns[k]?.mutable === true && !columns[k]?.writeOnly)

  // Insertable: mutable columns + required columns (even if not mutable,
  // a required column must be provided on insert)
  const insertable = allKeys.filter(k =>
    (columns[k]?.mutable === true || columns[k]?.required === true) && !columns[k]?.writeOnly
  )

  return { selectable, mutable, insertable, writeOnly }
}

/**
 * Detect the primary key column. Uses the option override, or scans
 * columns for `primaryKey: true`, or defaults to 'id'.
 */
const detectPrimaryKey = (columns: ColumnsConfig, override?: string): string => {
  if (override) {
    if (!(override in columns)) {
      throw new SchemaError(
        `Primary key '${override}' is not defined in the schema columns`
      )
    }
    return override
  }

  // Scan for explicit primaryKey: true
  for (const [key, config] of Object.entries(columns)) {
    if (!isRawColumn(config) && config.primaryKey) return key
  }

  // Default to 'id' if it exists
  if ('id' in columns) return 'id'

  throw new SchemaError(
    'No primary key detected. Either define a column with `primaryKey: true`, ' +
    'include an `id` column, or set `primaryKey` in options.'
  )
}

/**
 * Build the pre-built selectColumns map for Drizzle's db.select().
 * This maps selectable column names to their Drizzle column references.
 */
const buildSelectColumns = (
  drizzleTable: any,
  selectable: string[]
): Record<string, any> => {
  const result: Record<string, any> = {}

  for (const key of selectable) {
    if (key in drizzleTable) {
      result[key] = drizzleTable[key]
    }
  }

  return result
}

// -------------------------------------------------------- Internal API --

const DIALECTS = new Set<string>(['postgresql', 'mysql', 'sqlite', 'memory'])

/**
 * Build a dialect-bound defineTable function. Used internally by the
 * `defineTable()` overloads and by `connect()` to create the instance-bound
 * version (which also passes assertions from the config).
 */
export const buildDefineTable = (
  dialect: Dialect,
  assertions: AssertionRegistry = {}
) => {
  const mapping = getDialectMapping(dialect)

  const boundDefineTable = <TColumns extends ColumnsConfig>(
    name: string,
    columns: TColumns,
    options: TableOptions = {}
  ): TableDef<TColumns> => {
    // Inject timestamp columns if requested
    const resolvedColumns = options.timestamps
      ? injectTimestamps(columns) as TColumns
      : columns

    // Build Drizzle column objects from the DSL
    const drizzleColumns: Record<string, any> = {}

    for (const [key, config] of Object.entries(resolvedColumns)) {
      if (isRawColumn(config)) {
        drizzleColumns[key] = config.raw()
      } else {
        drizzleColumns[key] = buildDslColumn(key, config, dialect)
      }
    }

    // Build the third argument for Drizzle's table constructor
    // (indexes + constraints combined)
    const hasIndexes = options.indexes && Object.keys(options.indexes).length > 0
    const hasConstraints = typeof options.constraints === 'function'

    let tableExtras: ((table: any) => Record<string, any>) | undefined

    if (hasIndexes || hasConstraints) {
      tableExtras = (table: any) => {
        const indexDefs = hasIndexes
          ? buildIndexes(name, options.indexes!, resolvedColumns, dialect)(table)
          : {}

        const constraintDefs = hasConstraints
          ? options.constraints!(table)
          : {}

        return { ...indexDefs, ...constraintDefs }
      }
    }

    // Create the Drizzle table
    const drizzleTable = tableExtras
      ? mapping.tableConstructor(name, drizzleColumns, tableExtras)
      : mapping.tableConstructor(name, drizzleColumns)

    // Derive metadata
    const access = deriveAccess(resolvedColumns)
    const primaryKey = detectPrimaryKey(resolvedColumns, options.primaryKey)
    const selectColumns = buildSelectColumns(drizzleTable, access.selectable)

    // Build schemas
    const schemas = buildSchemaSet(resolvedColumns, access, assertions) as SchemaSet<TColumns>

    return {
      table: drizzleTable,
      columns: resolvedColumns,
      access,
      selectColumns,
      primaryKey,
      name,
      schemas,
    }
  }

  return boundDefineTable
}

// -------------------------------------------------------- Public API --

type BoundDefineTable = <TColumns extends ColumnsConfig>(
  name: string,
  columns: TColumns,
  options?: TableOptions
) => TableDef<TColumns>

/**
 * Define a database table with co-located column metadata.
 *
 * Three call signatures:
 *
 * 1. `defineTable('users', columns, options)` — auto-loads dialect from storium.config.ts
 * 2. `defineTable('postgresql')('users', columns, options)` — explicit dialect, returns bound function
 * 3. `defineTable()` — auto-loads dialect, returns reusable bound function
 */
export function defineTable(): BoundDefineTable
export function defineTable(dialect: Dialect): BoundDefineTable
export function defineTable<TColumns extends ColumnsConfig>(
  name: string,
  columns: TColumns,
  options?: TableOptions
): TableDef<TColumns>
export function defineTable(first?: string, columns?: any, options?: any) {
  // Overload 3: no-arg → auto-load dialect, return bound function
  if (first === undefined) {
    return buildDefineTable(loadDialectFromConfig())
  }

  // Overload 2: dialect string → return bound function.
  // Only matches when no columns are provided (second is undefined).
  // Note: table names that match a dialect string ('postgresql', 'mysql',
  // 'sqlite', 'memory') are therefore reserved and cannot be used as table names.
  if (DIALECTS.has(first) && columns === undefined) {
    return buildDefineTable(first as Dialect)
  }

  // Overload 1: table name → auto-load dialect, build immediately
  return buildDefineTable(loadDialectFromConfig())(first, columns, options)
}
