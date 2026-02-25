/**
 * Storium v1 — defineTable
 *
 * The core schema DSL. Defines a database table with co-located column metadata
 * (types, mutability, visibility, validation, sanitization), an index DSL, and
 * optional constraints. Produces a TableDef containing the real Drizzle table,
 * derived access sets, and auto-generated schemas.
 *
 * This is the schema-only entry point — no query functions. For a full store
 * with queries, use `defineStore()`. For adding queries to an existing TableDef,
 * use `createRepository()`.
 *
 * @example
 * const users = db.defineTable('users', {
 *   id:    { type: 'uuid', primaryKey: true, default: 'random_uuid' },
 *   email: { type: 'varchar', maxLength: 255, notNull: true, mutable: true },
 *   name:  { type: 'varchar', maxLength: 255, mutable: true },
 * }, {
 *   indexes: { email: { unique: true } },
 * })
 */

import type {
  Dialect,
  ColumnsConfig,
  TableOptions,
  TableDef,
  TableAccess,
  AssertionRegistry,
} from './types'
import { isRawColumn } from './types'
import { SchemaError } from './errors'
import { getDialectMapping, buildDslColumn } from './dialect'
import { buildIndexes } from './indexes'
import { buildSchemaSet } from './runtimeSchema'

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

  const hidden = allKeys.filter(k => columns[k]?.hidden === true)
  const selectable = allKeys.filter(k => !columns[k]?.hidden)
  const mutable = allKeys.filter(k => columns[k]?.mutable === true && !columns[k]?.hidden)

  // Insertable: mutable columns + required columns (even if not mutable,
  // a required column must be provided on insert)
  const insertable = allKeys.filter(k =>
    (columns[k]?.mutable === true || columns[k]?.required === true) && !columns[k]?.hidden
  )

  return { selectable, mutable, insertable, hidden }
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

// -------------------------------------------------------- Public API --

/**
 * Create a `defineTable` function bound to a specific dialect and assertion registry.
 * This is called internally by `connect()` to produce the instance-bound version.
 */
export const createDefineTable = (
  dialect: Dialect,
  assertions: AssertionRegistry = {}
) => {
  const mapping = getDialectMapping(dialect)

  /**
   * Define a database table with co-located column metadata.
   *
   * @param name - Database table name
   * @param columns - Flat column definitions
   * @param options - Indexes, constraints, timestamps, primary key override
   * @returns TableDef
   */
  const defineTable = <TColumns extends ColumnsConfig>(
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
    const schemas = buildSchemaSet(resolvedColumns, access, assertions)

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

  return defineTable
}
