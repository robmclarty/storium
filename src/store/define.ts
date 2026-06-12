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
  InferTableDialect,
  TableAccess,
  TableDef,
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
export type StoreDefinition<
  TTable extends Table = Table,
  TQueries extends QueriesConfig = {},
  TSoftDelete extends boolean = false,
> = {
  readonly __storeDefinition: true
  tableDef: TTable
  queryFns: TQueries
  /**
   * Whether this store enables soft delete. Carries the `softDelete: true`
   * literal captured from the config so `InferStore` can surface the
   * soft-delete methods (`restore`, `forceDestroy`, …) on the live store.
   */
  softDelete: TSoftDelete
  /** The Drizzle table object with storium metadata attached (for schemaCollector / drizzle-kit / mixins). */
  table: TTable & { storium: StoriumMeta }
  /** The table name (for schemaCollector). */
  name: string
  /**
   * Chain method: add custom query functions with full ctx inference.
   *
   * Infers the entire function record (`TFns`) — not just its keys — so each
   * query's parameter list and return type survive onto the live store after
   * `register()`. `ctx` is typed
   * `RepositoryContext<InferTableDialect<TTable>, TTable, TSoftDelete>`: the
   * dialect is inferred from the table flavor (a `pgTable` pins `'postgresql'`),
   * giving a concrete `ctx.drizzle` and typed CRUD even though the store
   * definition is inert. When `softDelete: true`, `ctx` also exposes the
   * soft-delete operations.
   */
  queries: <
    TFns extends Record<string, (ctx: RepositoryContext<InferTableDialect<TTable>, TTable, TSoftDelete>) => (...args: any[]) => any>
  >(
    fns: TFns
  ) => StoreDefinition<TTable, TQueries & TFns, TSoftDelete>
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
export const hasMeta = (value: unknown): value is TableDef =>
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
 * Extract composite PK column keys from a Drizzle table-level primaryKey() constraint.
 */
const detectCompositePK = (
  drizzleTable: any,
  drizzleCols: Record<string, Column>
): string | string[] | undefined => {
  const extraConfigSym = Object.getOwnPropertySymbols(drizzleTable)
    .find(s => s.toString() === 'Symbol(drizzle:ExtraConfigBuilder)')
  const extraConfigBuilder = extraConfigSym ? drizzleTable[extraConfigSym] : undefined
  if (typeof extraConfigBuilder !== 'function') return undefined

  const extras = extraConfigBuilder(drizzleTable)
  if (!Array.isArray(extras)) return undefined

  const pkBuilder = extras.find(
    (e: any) => e?.constructor?.name === 'PrimaryKeyBuilder' && Array.isArray(e.columns)
  )
  if (!pkBuilder) return undefined

  const sqlToKey = new Map<string, string>()
  for (const [key, col] of Object.entries(drizzleCols)) {
    sqlToKey.set((col as any).name, key)
  }

  const keys = pkBuilder.columns.map((c: any) => sqlToKey.get(c.name) ?? c.name)
  return keys.length === 1 ? keys[0] : keys
}

/**
 * Detect the primary key column(s) from Drizzle column metadata.
 */
const detectPrimaryKey = (
  drizzleTable: any,
  drizzleCols: Record<string, Column>
): string | string[] | undefined => {
  const pkColumns: string[] = []

  for (const [key, col] of Object.entries(drizzleCols)) {
    if (col.primary) pkColumns.push(key)
  }

  if (pkColumns.length === 1) return pkColumns[0]!
  if (pkColumns.length > 1) return pkColumns

  return detectCompositePK(drizzleTable, drizzleCols)
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
    conflictTarget: config.conflictTarget,
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
const makeStoreDefinition = <
  TTable extends Table = Table,
  TQueries extends QueriesConfig = {},
  TSoftDelete extends boolean = false,
>(
  drizzleTable: TTable,
  config: StoreConfig,
  queryFns: TQueries,
  assertions: AssertionRegistry = {}
): StoreDefinition<TTable, TQueries, TSoftDelete> => {
  // Attach storium metadata if not already present
  if (!hasMeta(drizzleTable)) {
    attachStoriumMeta(drizzleTable, config, assertions)
  }

  return {
    __storeDefinition: true as const,
    tableDef: drizzleTable,
    queryFns,
    // Runtime boolean from the attached metadata; typed as the captured literal
    // so the overloaded `defineStore` return types stay precise.
    softDelete: ((drizzleTable as any).storium.softDelete === true) as TSoftDelete,
    table: drizzleTable as TTable & { storium: StoriumMeta },
    name: (drizzleTable as any).storium.name,
    // The chained call threads TSoftDelete and merges queries at runtime. Its
    // static return is cast to `any` because this non-generic lambda can't carry
    // the per-call `TFns`; consumers get the precise `TQueries & TFns` type from
    // StoreDefinition's `queries` signature, which annotates this field.
    queries: (newQueries: any): any =>
      makeStoreDefinition<TTable, TQueries, TSoftDelete>(
        drizzleTable,
        config,
        { ...queryFns, ...newQueries },
        assertions
      ),
  }
}

// -------------------------------------------------------- Public API --

/**
 * Define a store — wraps a Drizzle table with storium metadata and
 * optional `.queries()` chain.
 *
 * Overloaded so `{ softDelete: true }` is captured at the type level: a
 * soft-delete store carries `TSoftDelete = true` through `register()` and
 * exposes `restore` / `forceDestroy` / `findWithDeleted` / … on the live store.
 * `config.columns` keys are constrained to the table's columns — a typo is a
 * compile error.
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
 * // With soft delete — `register()`'d store exposes restore(), forceDestroy(), …
 * const userStore = defineStore(usersTable, { softDelete: true })
 *
 * // Without annotations
 * const bareStore = defineStore(usersTable)
 */
export function defineStore<TTable extends Table<any>>(
  drizzleTable: TTable,
  config: StoreConfig<TTable> & { softDelete: true }
): StoreDefinition<TTable, {}, true>
export function defineStore<TTable extends Table<any>>(
  drizzleTable: TTable,
  config?: StoreConfig<TTable>
): StoreDefinition<TTable, {}, false>

export function defineStore(drizzleTable: any, config: StoreConfig = {}) {
  if (!isTable(drizzleTable)) {
    throw new SchemaError(
      'defineStore(): first argument must be a Drizzle table (from pgTable/sqliteTable/mysqlTable). ' +
      `Got: ${typeof drizzleTable}`
    )
  }

  // Cast to satisfy both overloads (true/false TSoftDelete) — the runtime
  // `softDelete` field carries the real boolean; the overloads pick the literal.
  return makeStoreDefinition(drizzleTable, config, {}) as StoreDefinition<Table, {}, boolean>
}
