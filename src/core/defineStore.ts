/**
 * Storium v1 — defineStore
 *
 * Bundles a TableDef with custom query functions into a StoreDefinition.
 * This is a pure data structure — no database connection needed.
 *
 * The StoreDefinition is materialized into a live store (with CRUD methods
 * and bound queries) when passed to `db.register()`.
 *
 * @example
 * import { defineStore } from 'storium'
 * import { usersTable } from './user.schema'
 * import { search, findByEmail } from './user.queries'
 *
 * export const userStore = defineStore(usersTable, { search, findByEmail })
 */

import type {
  ColumnsConfig,
  TableDef,
  CustomQueryFn,
} from './types'

// --------------------------------------------------------------- Types --

/**
 * A store definition: a TableDef bundled with custom query functions.
 * This is an inert data structure — pass it to `db.register()` to
 * get a live store with CRUD + query methods.
 */
export type StoreDefinition<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
> = {
  readonly __storeDefinition: true
  tableDef: TableDef<TColumns>
  queries: TQueries
}

/**
 * Type guard: is this value a StoreDefinition?
 */
export const isStoreDefinition = (value: any): value is StoreDefinition =>
  value !== null &&
  typeof value === 'object' &&
  value.__storeDefinition === true

// -------------------------------------------------------- Public API --

/**
 * Define a store by bundling a TableDef with custom query functions.
 *
 * Returns a StoreDefinition (inert DTO). Pass it to `db.register()`
 * to get a live store with CRUD operations and bound queries.
 *
 * @param tableDef - A table definition from `defineTable()`
 * @param queries - Custom query functions (receive repository context)
 * @returns StoreDefinition
 */
export const defineStore = <
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
>(
  tableDef: TableDef<TColumns>,
  queries: TQueries = {} as TQueries
): StoreDefinition<TColumns, TQueries> => ({
  __storeDefinition: true as const,
  tableDef,
  queries,
})
