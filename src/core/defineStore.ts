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
 * export const userStore = defineStore(usersTable, { search, findByEmail })
 */

import type {
  ColumnsConfig,
  TableDef,
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
 */
export type StoreDefinition<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends Record<string, Function> = {}
> = {
  readonly __storeDefinition: true
  tableDef: TableDef<TColumns>
  queries: TQueries
  /** The Drizzle table object (for schemaCollector / drizzle-kit). */
  table: any
  /** The table name (for schemaCollector). */
  name: string
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
 * Create a StoreDefinition from a table (from defineTable) and queries.
 * Surfaces .table and .name for schemaCollector compatibility.
 */
const makeStoreDefinition = <
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, Function> = {}
>(
  tableDef: TableDef<TColumns>,
  queries: TQueries
): StoreDefinition<TColumns, TQueries> => ({
  __storeDefinition: true as const,
  tableDef,
  queries,
  table: tableDef,
  name: tableDef.storium.name,
})

// -------------------------------------------------------- Public API --

/**
 * Define a store — bundles a table with custom queries into a StoreDefinition.
 *
 * @param tableDef - A table from `defineTable()`
 * @param queries - Optional custom query functions
 *
 * @example
 * const userStore = defineStore(usersTable, { search, findByEmail })
 */
export function defineStore<
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, Function> = {}
>(
  tableDef: TableDef<TColumns>,
  queries?: TQueries
): StoreDefinition<TColumns, TQueries>

export function defineStore(first: any, second?: any) {
  if (hasMeta(first)) {
    return makeStoreDefinition(first, (second ?? {}) as any)
  }

  throw new ConfigError(
    'defineStore(): first argument must be a table from defineTable(). ' +
    'Got: ' + typeof first
  )
}
