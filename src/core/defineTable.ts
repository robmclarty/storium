/**
 * @module defineTable
 *
 * The core schema DSL. Defines a database table with co-located column metadata
 * (types, mutability, visibility, validation, sanitization), an index DSL, and
 * optional constraints. Returns a plain Drizzle table with storium metadata
 * attached as a non-enumerable `.storium` property.
 *
 * Chain API:
 *
 * @example
 * // 1. Direct call — auto-loads dialect from drizzle.config.ts
 * const users = defineTable('users').columns({
 *   id:    { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
 *   email: { type: 'varchar', maxLength: 255, notNull: true },
 * })
 *
 * @example
 * // 2. Curried with explicit dialect
 * const users = defineTable('postgresql')('users').columns({ ... })
 *
 * @example
 * // 3. No-arg — auto-loads dialect, returns reusable bound function
 * const dt = defineTable()
 * const users = dt('users').columns({ ... }).indexes({ email: { unique: true } })
 *
 * @example
 * // 4. Chain methods — indexes, access, primaryKey, timestamps
 * const posts = defineTable('posts')
 *   .columns({ id: { type: 'uuid', primaryKey: true }, title: { type: 'varchar' } })
 *   .indexes({ title: {} })
 *   .access({ readonly: ['title'] })
 *
 * const postTags = defineTable('postTags')
 *   .columns({ postId: { type: 'uuid' }, tagId: { type: 'uuid' } })
 *   .primaryKey('postId', 'tagId')
 *   .timestamps(false)
 */

import type {
  Dialect,
  ColumnsConfig,
  TableBuilderConfig,
  TableDef,
  TableAccess,
  AccessConfig,
  IndexesConfig,
  SchemaSet,
  AssertionRegistry,
  TimestampColumns,
} from './types'

// --------------------------------------------------------- Storium Meta --

/**
 * Storium metadata attached to every Drizzle table produced by defineTable().
 * Accessed via `table.storium.columns`, `table.storium.schemas`, etc.
 */
export type StoriumMeta<TColumns extends ColumnsConfig = ColumnsConfig> = {
  columns: TColumns
  access: TableAccess
  selectColumns: Record<string, any>
  allColumns: Record<string, any>
  /** Primary key column(s). Undefined only when `.primaryKey()` chain hasn't been called yet. */
  primaryKey: string | string[] | undefined
  name: string
  schemas: SchemaSet<TColumns>
}

/**
 * Check whether a value is a storium-defined table (has `.storium` metadata).
 */
export const hasMeta = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && 'storium' in (value as any)
import { isRawColumn } from './types'
import { SchemaError } from './errors'
import { getDialectMapping, buildDslColumn } from './dialect'
import { buildIndexes } from './indexes'
import { buildSchemaSet } from './runtimeSchema'
import { loadDialectFromConfig } from './configLoader'

// ------------------------------------------------------------ Helpers --

/**
 * Inject timestamp columns unless already defined by the user.
 * Uses camelCase keys; the general toSnakeCase mechanism in dialect.ts
 * handles the DB column naming (createdAt → created_at).
 */
const injectTimestamps = (columns: ColumnsConfig): ColumnsConfig => {
  const result = { ...columns }

  if (!('createdAt' in result)) {
    result.createdAt = {
      type: 'timestamp',
      notNull: true,
      default: 'now',
      readonly: true,
    }
  }

  if (!('updatedAt' in result)) {
    result.updatedAt = {
      type: 'timestamp',
      notNull: true,
      default: 'now',
    }
  }

  return result
}

/**
 * Derive access sets from column configs, optionally merging table-level
 * access overrides from `.access()`.
 */
const deriveAccess = (columns: ColumnsConfig, accessOverrides?: AccessConfig): TableAccess => {
  const allKeys = Object.keys(columns)

  // Validate override references
  if (accessOverrides) {
    for (const col of accessOverrides.hidden ?? []) {
      if (!(col in columns)) {
        throw new SchemaError(
          `access({ hidden }): column '${col}' is not defined in the schema`
        )
      }
    }
    for (const col of accessOverrides.readonly ?? []) {
      if (!(col in columns)) {
        throw new SchemaError(
          `access({ readonly }): column '${col}' is not defined in the schema`
        )
      }
    }
  }

  // Guard invalid column config combinations at definition time.
  for (const key of allKeys) {
    const col = columns[key]

    if (col?.readonly === true && col?.required === true) {
      throw new SchemaError(
        `Column '${key}': cannot be both \`readonly\` and \`required\` ` +
        '(a required value that can never be written is lost in the abyss).'
      )
    }

    if (col?.readonly === true && col?.hidden === true) {
      throw new SchemaError(
        `Column '${key}': cannot be both \`readonly\` and \`hidden\` ` +
        '(column would be inaccessible — excluded from both reads and writes).'
      )
    }
  }

  const overrideHidden = new Set(accessOverrides?.hidden ?? [])
  const overrideReadonly = new Set(accessOverrides?.readonly ?? [])

  const isReadonly = (k: string) => {
    if (overrideReadonly.has(k)) return true
    const col = columns[k]
    return col?.readonly === true || (!isRawColumn(col) && (col as any)?.primaryKey === true)
  }

  const isHidden = (k: string) =>
    overrideHidden.has(k) || columns[k]?.hidden === true

  // Validate no column is both hidden and readonly after merging
  for (const key of allKeys) {
    if (isHidden(key) && isReadonly(key)) {
      throw new SchemaError(
        `Column '${key}': cannot be both \`readonly\` and \`hidden\` ` +
        '(column would be inaccessible — excluded from both reads and writes).'
      )
    }
  }

  const hidden = allKeys.filter(k => isHidden(k))
  const readonly = allKeys.filter(k => isReadonly(k))
  const selectable = allKeys.filter(k => !isHidden(k))
  const writable = allKeys.filter(k => !isReadonly(k))

  return { selectable, writable, hidden, readonly }
}

/**
 * Detect the primary key column(s). Uses the option override, or scans
 * columns for `primaryKey: true`, or defaults to 'id'.
 * Returns a string for single PK, string[] for composite, or undefined
 * if no PK is found (valid when `.primaryKey()` chain will be called later).
 */
const detectPrimaryKey = (
  columns: ColumnsConfig,
  override?: string | string[]
): string | string[] | undefined => {
  if (override) {
    if (Array.isArray(override)) {
      for (const col of override) {
        if (!(col in columns)) {
          throw new SchemaError(
            `Composite primary key references column '${col}' which is not defined in the schema`
          )
        }
      }
      return override
    }
    if (!(override in columns)) {
      throw new SchemaError(
        `Primary key '${override}' is not defined in the schema columns`
      )
    }
    return override
  }

  // Scan for explicit primaryKey: true
  const pkColumns: string[] = []
  for (const [key, config] of Object.entries(columns)) {
    if (!isRawColumn(config) && config.primaryKey) pkColumns.push(key)
  }
  if (pkColumns.length === 1) return pkColumns[0]!
  if (pkColumns.length > 1) return pkColumns

  // Default to 'id' if it exists
  if ('id' in columns) return 'id'

  // No PK detected — valid when the user intends to call `.primaryKey()`
  // later in the chain. createRepository validates that a PK is set.
  return undefined
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

// --------------------------------------------------- Internal Config --

/**
 * Internal accumulated config for a table being built.
 * Passed through the chain — each method clones and updates one field.
 */
type BuildConfig = {
  name: string
  columns: ColumnsConfig
  dialect: Dialect
  assertions: AssertionRegistry
  options: TableBuilderConfig
}

// -------------------------------------------------------- Table Build --

/**
 * Build a Drizzle table from accumulated config. This is the core function
 * called by `.columns()` and each chain method.
 */
const buildTable = <TColumns extends ColumnsConfig>(config: BuildConfig): TableDef<TColumns> => {
  const { name, columns, dialect, assertions, options } = config
  const mapping = getDialectMapping(dialect)

  // Inject timestamp columns if requested
  const resolvedColumns = options.timestamps !== false
    ? injectTimestamps(columns) as TColumns
    : columns as unknown as TColumns

  // Detect primary key early so composite PKs can skip .primaryKey() on individual columns
  const primaryKey = detectPrimaryKey(resolvedColumns, options.primaryKey)
  const isCompositePk = Array.isArray(primaryKey)
  const compositePkSet = isCompositePk ? new Set(primaryKey) : null

  // Build Drizzle column objects from the DSL
  const drizzleColumns: Record<string, any> = {}

  for (const [key, col] of Object.entries(resolvedColumns)) {
    if (isRawColumn(col)) {
      drizzleColumns[key] = col.raw()
    } else {
      // For composite PKs, strip primaryKey from individual columns —
      // the constraint handles it at the table level
      const effectiveConfig = compositePkSet?.has(key)
        ? { ...col, primaryKey: false }
        : col
      drizzleColumns[key] = buildDslColumn(key, effectiveConfig, dialect)
    }
  }

  // Build the third argument for Drizzle's table constructor
  // (indexes + constraints + composite PK)
  const hasIndexes = options.indexes && Object.keys(options.indexes).length > 0
  const hasConstraints = typeof options.constraints === 'function'
  const needsExtras = hasIndexes || hasConstraints || isCompositePk

  let tableExtras: ((table: any) => Record<string, any>) | undefined

  if (needsExtras) {
    tableExtras = (table: any) => {
      const indexDefs = hasIndexes
        ? buildIndexes(name, options.indexes!, resolvedColumns, dialect)(table)
        : {}

      const constraintDefs = hasConstraints
        ? options.constraints!(table)
        : {}

      // Add composite PK constraint via Drizzle's primaryKey() function
      let pkDef: Record<string, any> = {}
      if (isCompositePk) {
        const { primaryKey: pkFn } = require(`drizzle-orm/${dialect === 'memory' ? 'sqlite' : dialect}-core`)
        pkDef = { pk: pkFn({ columns: primaryKey.map(col => table[col]) }) }
      }

      return { ...indexDefs, ...constraintDefs, ...pkDef }
    }
  }

  // Create the Drizzle table
  const drizzleTable = tableExtras
    ? mapping.tableConstructor(name, drizzleColumns, tableExtras)
    : mapping.tableConstructor(name, drizzleColumns)

  // Derive metadata (with optional access overrides from .access())
  const access = deriveAccess(resolvedColumns, options.access)
  const allKeys = Object.keys(resolvedColumns)
  const selectColumns = buildSelectColumns(drizzleTable, access.selectable)
  const allColumns = buildSelectColumns(drizzleTable, allKeys)

  // Build schemas
  const schemas = buildSchemaSet(resolvedColumns, access, assertions) as SchemaSet<TColumns>

  // Attach storium metadata as a non-enumerable property on the Drizzle table.
  // drizzle-kit sees a real Drizzle table; storium code accesses table.storium.*
  Object.defineProperty(drizzleTable, 'storium', {
    value: { columns: resolvedColumns, access, selectColumns, allColumns, primaryKey, name, schemas },
    enumerable: false,
    configurable: true,
    writable: false,
  })

  // Attach chain methods as non-enumerable properties.
  // Each method clones config, updates one field, and rebuilds the table.
  attachChainMethods(drizzleTable, config)

  return drizzleTable
}

/**
 * Attach non-enumerable chain methods to a Drizzle table object.
 * These let users refine the table definition after `.columns()`.
 */
const attachChainMethods = (table: any, config: BuildConfig) => {
  const define = (name: string, fn: (...args: any[]) => any) => {
    Object.defineProperty(table, name, {
      value: fn,
      enumerable: false,
      configurable: true,
      writable: false,
    })
  }

  define('indexes', (indexesConfig: IndexesConfig) =>
    buildTable({ ...config, options: { ...config.options, indexes: indexesConfig } })
  )

  define('access', (accessConfig: AccessConfig) =>
    buildTable({ ...config, options: { ...config.options, access: accessConfig } })
  )

  define('primaryKey', (...columns: string[]) =>
    buildTable({ ...config, options: { ...config.options, primaryKey: columns } })
  )

  define('timestamps', (enabled: false) =>
    buildTable({ ...config, options: { ...config.options, timestamps: enabled } })
  )
}

// -------------------------------------------------------- Internal API --

const DIALECTS = new Set<string>(['postgresql', 'mysql', 'sqlite', 'memory'])

// createRequire is used intentionally: defineTable chain methods rebuild
// synchronously, and dialect-specific Drizzle modules must load lazily.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

/**
 * Build a dialect-bound defineTable function. Used internally by the
 * `defineTable()` overloads and by `connect()` to create the instance-bound
 * version (which also passes assertions from the config).
 *
 * Returns a function `(name) => { columns: (cols) => TableDef }` (chain builder).
 */
export const buildDefineTable = (
  dialect: Dialect,
  assertions: AssertionRegistry = {}
) => {
  /**
   * Start building a table definition. Returns a builder with `.columns()`.
   */
  const boundDefineTable = (name: string) => ({
    columns: <TColumns extends ColumnsConfig>(
      columns: TColumns
    ): TableDef<TColumns & TimestampColumns> => {
      const config: BuildConfig = {
        name,
        columns,
        dialect,
        assertions,
        options: {},
      }
      return buildTable<TColumns & TimestampColumns>(config)
    }
  })

  return boundDefineTable
}

// -------------------------------------------------------- Public API --

/**
 * Return type of `defineTable()` or `defineTable('postgresql')` — a function
 * that takes a table name and returns a builder with `.columns()`.
 */
type BoundDefineTable = (name: string) => {
  columns: <TColumns extends ColumnsConfig>(
    columns: TColumns
  ) => TableDef<TColumns & TimestampColumns>
}

/**
 * Define a database table with co-located column metadata.
 *
 * Three call signatures:
 *
 * 1. `defineTable('users').columns({ ... })` — auto-loads dialect from drizzle.config.ts
 * 2. `defineTable('postgresql')('users').columns({ ... })` — explicit dialect
 * 3. `defineTable()` — auto-loads dialect, returns reusable bound function
 */
export function defineTable(): BoundDefineTable
export function defineTable(dialect: Dialect): BoundDefineTable
export function defineTable(name: string): { columns: <TColumns extends ColumnsConfig>(columns: TColumns) => TableDef<TColumns & TimestampColumns> }
export function defineTable(first?: string) {
  // Overload 3: no-arg → auto-load dialect, return bound function
  if (first === undefined) {
    return buildDefineTable(loadDialectFromConfig())
  }

  // Overload 2: dialect string → return bound function.
  if (DIALECTS.has(first)) {
    return buildDefineTable(first as Dialect)
  }

  // Overload 1: table name → auto-load dialect, return builder
  return buildDefineTable(loadDialectFromConfig())(first)
}
