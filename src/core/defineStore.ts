/**
 * @module defineStore
 *
 * Bundles a table (from defineTable) with custom query functions into a
 * StoreDefinition. This is a pure data structure — no database connection needed.
 *
 * The StoreDefinition is materialized into a live store (with CRUD methods
 * and bound queries) when passed to `db.register()`.
 *
 * @example
 * import { defineStore } from 'storium'
 * import { usersTable } from './user.schema'
 * import { search, findByEmail } from './user.queries'
 *
 * // With queries (chain method — ctx is fully typed)
 * export const userStore = defineStore(usersTable).queries({ search, findByEmail })
 *
 * // Without queries
 * export const bareStore = defineStore(usersTable)
 */

import type {
  ColumnsConfig,
  QueriesConfig,
  TableDef,
  RepositoryContext,
} from './types'
import { hasMeta } from './defineTable'
import { ConfigError } from './errors'

// --------------------------------------------------------------- Types --

/**
 * A store definition: a table (from defineTable) bundled with custom query
 * functions. This is an inert data structure — pass it to `db.register()`
 * to get a live store with CRUD + query methods.
 *
 * Surfaces `.table` and `.name` so that schemaCollector can detect
 * StoreDefinition exports for drizzle-kit migrations.
 *
 * The `.queries()` chain method enables full `ctx` inference — TypeScript
 * knows `TColumns` from `defineStore(table)`, so when `.queries()` is called,
 * the callback parameter `ctx` gets contextual typing automatically.
 */
export type StoreDefinition<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends QueriesConfig = {}
> = {
  readonly __storeDefinition: true
  tableDef: TableDef<TColumns>
  queryFns: TQueries
  /** The Drizzle table object (for schemaCollector / drizzle-kit). */
  table: any
  /** The table name (for schemaCollector). */
  name: string
  /** Chain method: add custom query functions with full ctx inference. */
  queries: <TKeys extends string>(
    fns: Record<TKeys, (ctx: RepositoryContext<TableDef<TColumns>, TColumns>) => (...args: any[]) => any>
  ) => StoreDefinition<TColumns, TQueries & Record<TKeys, (ctx: RepositoryContext<TableDef<TColumns>, TColumns>) => (...args: any[]) => any>>
}

/**
 * Type guard: is this value a StoreDefinition?
 */
export const isStoreDefinition = (value: any): value is StoreDefinition =>
  value !== null &&
  typeof value === 'object' &&
  value.__storeDefinition === true

// -------------------------------------------------------- Internal API --

/**
 * Create a StoreDefinition from a table (from defineTable) and query functions.
 * Surfaces .table and .name for schemaCollector compatibility.
 * Attaches .queries() chain method for adding queries with ctx inference.
 */
const makeStoreDefinition = <
  TColumns extends ColumnsConfig,
  TQueries extends QueriesConfig = {}
>(
  tableDef: TableDef<TColumns>,
  queryFns: TQueries
): StoreDefinition<TColumns, TQueries> => ({
  __storeDefinition: true as const,
  tableDef,
  queryFns,
  table: tableDef,
  name: tableDef.storium.name,
  queries: (newQueries: any) =>
    makeStoreDefinition(tableDef, { ...queryFns, ...newQueries }),
})

// -------------------------------------------------------- Public API --

/**
 * Define a store — bundles a table with an optional `.queries()` chain.
 *
 * @param tableDef - A table from `defineTable()`
 * @returns StoreDefinition with `.queries()` chain method
 *
 * @example
 * // With queries
 * const userStore = defineStore(usersTable).queries({ search, findByEmail })
 *
 * // Without queries
 * const bareStore = defineStore(usersTable)
 */
export function defineStore<TColumns extends ColumnsConfig>(
  tableDef: TableDef<TColumns>
): StoreDefinition<TColumns, {}>

export function defineStore(tableDef: any) {
  if (hasMeta(tableDef)) {
    return makeStoreDefinition(tableDef, {})
  }

  throw new ConfigError(
    'defineStore(): first argument must be a table from defineTable(). ' +
    'Got: ' + typeof tableDef
  )
}
