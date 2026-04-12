/**
 * @module defineStore
 *
 * The primary entry point for adding storium metadata to a Drizzle table.
 * Accepts a raw Drizzle table + optional StoreConfig (column annotations,
 * soft delete), and returns a StoreDefinition.
 *
 * The StoreDefinition is materialized into a live store (with CRUD methods
 * and bound queries) when passed to `db.register()`.
 *
 * @example
 * import { pgTable, uuid, varchar, text } from 'drizzle-orm/pg-core'
 * import { defineStore } from 'storium'
 *
 * const usersTable = pgTable('users', {
 *   id: uuid('id').primaryKey().defaultRandom(),
 *   email: varchar('email', { length: 255 }).notNull(),
 *   password: text('password').notNull(),
 * })
 *
 * // With annotations
 * export const userStore = defineStore(usersTable, {
 *   columns: {
 *     email: { required: true, validate: (v, test) => test(v, 'is_email') },
 *     password: { hidden: true },
 *   },
 * }).queries({ findByEmail: (ctx) => async (email) => ctx.findOne({ email }) })
 *
 * // Without annotations
 * export const bareStore = defineStore(usersTable)
 */

import type {
  ColumnAnnotations,
  StoreConfig,
  QueriesConfig,
  RepositoryContext,
  TableAccess,
  StoriumMeta,
  AssertionRegistry,
} from '../types'
import { SchemaError } from '../errors'
import { buildSchemaSet } from '../schema/zod'
import { isTable, getTableName } from 'drizzle-orm/table'
import { getTableColumns } from 'drizzle-orm/utils'
import type { Column, Table } from 'drizzle-orm'

// --------------------------------------------------------------- Types --

/**
 * A store definition: a Drizzle table bundled with storium metadata and
 * optional custom query functions. This is an inert data structure — pass
 * it to `db.register()` to get a live store with CRUD + query methods.
 *
 * Surfaces `.table` and `.name` so that schemaCollector can detect
 * StoreDefinition exports for drizzle-kit migrations.
 */
export type StoreDefinition<TTable extends Table = Table, TQueries extends QueriesConfig = {}> = {
  readonly __storeDefinition: true
  tableDef: TTable
  queryFns: TQueries
  /** The Drizzle table object (for schemaCollector / drizzle-kit). */
  table: TTable
  /** The table name (for schemaCollector). */
  name: string
  /** Chain method: add custom query functions with full ctx inference. */
  queries: <TKeys extends string>(
    fns: Record<TKeys, (ctx: RepositoryContext) => (...args: any[]) => any>
  ) => StoreDefinition<TTable, TQueries & Record<TKeys, (ctx: RepositoryContext) => (...args: any[]) => any>>
}

/**
 * Type guard: is this value a StoreDefinition?
 */
export const isStoreDefinition = (value: any): value is StoreDefinition =>
  value !== null &&
  typeof value === 'object' &&
  value.__storeDefinition === true

// ------------------------------------------------------------- Helpers --

/**
 * Check whether a value is a storium-annotated table (has `.storium` metadata).
 */
export const hasMeta = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && 'storium' in (value as any)

/**
 * Validate that annotation column names exist in the Drizzle table, and
 * that no column has conflicting readonly + hidden flags.
 */
const validateAnnotations = (
  drizzleCols: Record<string, Column>,
  annotations: ColumnAnnotations
) => {
  for (const [key, ann] of Object.entries(annotations)) {
    if (!(key in drizzleCols)) {
      throw new SchemaError(
        `defineStore(): annotation for column '${key}' does not match any column in the Drizzle table. ` +
        `Available columns: ${Object.keys(drizzleCols).join(', ')}`
      )
    }
    if (ann.readonly && ann.hidden) {
      throw new SchemaError(
        `Column '${key}': cannot be both \`readonly\` and \`hidden\` ` +
        '(column would be inaccessible — excluded from both reads and writes).'
      )
    }
    if (ann.readonly && ann.required) {
      throw new SchemaError(
        `Column '${key}': cannot be both \`readonly\` and \`required\` ` +
        '(a required value that can never be written is lost in the abyss).'
      )
    }
  }
}

/**
 * Derive access sets from Drizzle column metadata + storium annotations.
 */
const deriveAccess = (
  drizzleCols: Record<string, Column>,
  annotations: ColumnAnnotations
): TableAccess => {
  const allKeys = Object.keys(drizzleCols)

  const isReadonly = (k: string): boolean => {
    if (annotations[k]?.readonly) return true
    // Primary key columns are always readonly
    if (drizzleCols[k]?.primary) return true
    return false
  }

  const isHidden = (k: string): boolean =>
    annotations[k]?.hidden === true

  return {
    selectable: allKeys.filter(k => !isHidden(k)),
    writable: allKeys.filter(k => !isReadonly(k)),
    hidden: allKeys.filter(k => isHidden(k)),
    readonly: allKeys.filter(k => isReadonly(k)),
  }
}

/**
 * Detect the primary key column(s) from Drizzle column metadata.
 */
const detectPrimaryKey = (
  drizzleTable: any,
  drizzleCols: Record<string, Column>
): string | string[] | undefined => {
  // Check per-column .primary flag (single-column PKs defined inline)
  const pkColumns: string[] = []

  for (const [key, col] of Object.entries(drizzleCols)) {
    if (col.primary) pkColumns.push(key)
  }

  if (pkColumns.length === 1) return pkColumns[0]!
  if (pkColumns.length > 1) return pkColumns

  // Check table-level composite PK constraint (e.g., primaryKey({ columns: [...] }))
  const extraConfigSym = Object.getOwnPropertySymbols(drizzleTable)
    .find(s => s.toString() === 'Symbol(drizzle:ExtraConfigBuilder)')
  const extraConfigBuilder = extraConfigSym ? drizzleTable[extraConfigSym] : undefined
  if (typeof extraConfigBuilder === 'function') {
    const extras = extraConfigBuilder(drizzleTable)
    if (Array.isArray(extras)) {
      for (const extra of extras) {
        if (extra?.constructor?.name === 'PrimaryKeyBuilder' && Array.isArray(extra.columns)) {
          const colNames = extra.columns.map((c: any) => c.name)
          // Build a reverse map from SQL column names to JS property keys
          const sqlToKey = new Map<string, string>()
          for (const [key, col] of Object.entries(drizzleCols)) {
            sqlToKey.set((col as any).name, key)
          }
          const keys = colNames.map((n: string) => sqlToKey.get(n) ?? n)
          return keys.length === 1 ? keys[0] : keys
        }
      }
    }
  }

  return undefined
}

/**
 * Build the pre-built selectColumns map for Drizzle's db.select().
 */
const buildSelectColumns = (
  drizzleTable: any,
  keys: string[]
): Record<string, any> => {
  const result: Record<string, any> = {}
  for (const key of keys) {
    if (key in drizzleTable) {
      result[key] = drizzleTable[key]
    }
  }
  return result
}

// -------------------------------------------------------- Metadata Build --

/**
 * Build and attach StoriumMeta to a Drizzle table.
 * Returns the table with `.storium` as a non-enumerable property.
 */
export const attachStoriumMeta = (
  drizzleTable: any,
  config: StoreConfig = {},
  assertions: AssertionRegistry = {}
): any => {
  const name = getTableName(drizzleTable)
  const drizzleCols = getTableColumns(drizzleTable)
  const annotations = config.columns ?? {}

  // Validate annotations
  validateAnnotations(drizzleCols, annotations)

  // Validate soft delete
  if (config.softDelete && !('deletedAt' in drizzleCols)) {
    throw new SchemaError(
      `defineStore(): softDelete is enabled but the Drizzle table '${name}' ` +
      "has no 'deletedAt' column. Add a deletedAt column to your Drizzle table definition."
    )
  }

  // Derive metadata
  const access = deriveAccess(drizzleCols, annotations)
  const allKeys = Object.keys(drizzleCols)
  const selectColumns = buildSelectColumns(drizzleTable, access.selectable)
  const allColumns = buildSelectColumns(drizzleTable, allKeys)
  const primaryKey = detectPrimaryKey(drizzleTable, drizzleCols)
  const schemas = buildSchemaSet(drizzleTable, annotations, access, assertions)

  const meta: StoriumMeta = {
    annotations,
    access,
    selectColumns,
    allColumns,
    primaryKey,
    name,
    schemas,
    softDelete: config.softDelete === true,
  }

  // Attach storium metadata as a non-enumerable property on the Drizzle table.
  // drizzle-kit sees a real Drizzle table; storium code accesses table.storium.*
  Object.defineProperty(drizzleTable, 'storium', {
    value: meta,
    enumerable: false,
    configurable: true,
    writable: false,
  })

  return drizzleTable
}

// -------------------------------------------------------- Internal API --

/**
 * Create a StoreDefinition from a Drizzle table and query functions.
 */
const makeStoreDefinition = <TTable extends Table = Table, TQueries extends QueriesConfig = {}>(
  drizzleTable: TTable,
  config: StoreConfig,
  queryFns: TQueries,
  assertions: AssertionRegistry = {}
): StoreDefinition<TTable, TQueries> => {
  // Attach storium metadata if not already present
  if (!hasMeta(drizzleTable)) {
    attachStoriumMeta(drizzleTable, config, assertions)
  }

  return {
    __storeDefinition: true as const,
    tableDef: drizzleTable,
    queryFns,
    table: drizzleTable,
    name: (drizzleTable as any).storium.name,
    queries: (newQueries: any) =>
      makeStoreDefinition(drizzleTable, config, { ...queryFns, ...newQueries }, assertions),
  }
}

// -------------------------------------------------------- Public API --

/**
 * Define a store — wraps a Drizzle table with storium metadata and
 * optional `.queries()` chain.
 *
 * @param drizzleTable - A raw Drizzle table (from pgTable, sqliteTable, etc.)
 * @param config - Optional store config (column annotations, soft delete)
 * @returns StoreDefinition with `.queries()` chain method
 *
 * @example
 * // With annotations
 * const userStore = defineStore(usersTable, {
 *   columns: { email: { required: true } },
 * }).queries({ findByEmail: (ctx) => ... })
 *
 * // Without annotations
 * const bareStore = defineStore(usersTable)
 */
export function defineStore<TTable extends Table>(
  drizzleTable: TTable,
  config?: StoreConfig
): StoreDefinition<TTable, {}>

export function defineStore(drizzleTable: any, config: StoreConfig = {}) {
  if (!isTable(drizzleTable)) {
    throw new SchemaError(
      'defineStore(): first argument must be a Drizzle table (from pgTable/sqliteTable/mysqlTable). ' +
      `Got: ${typeof drizzleTable}`
    )
  }

  return makeStoreDefinition(drizzleTable, config, {})
}
