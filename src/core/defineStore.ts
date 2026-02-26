/**
 * Storium v1 — defineStore
 *
 * Bundles a TableDef with custom query functions into a StoreDefinition.
 * This is a pure data structure — no database connection needed.
 *
 * The StoreDefinition is materialized into a live store (with CRUD methods
 * and bound queries) when passed to `db.register()`.
 *
 * Three call signatures (mirroring defineTable):
 *
 * @example
 * // 1. Wrap a pre-built TableDef (multi-file pattern)
 * import { defineStore } from 'storium'
 * import { usersTable } from './user.schema'
 * import { search, findByEmail } from './user.queries'
 * export const userStore = defineStore(usersTable, { search, findByEmail })
 *
 * @example
 * // 2. One-call with explicit dialect (curried)
 * const userStore = defineStore('postgresql')('users', columns, { queries: { search } })
 *
 * @example
 * // 3. One-call, auto-loads dialect from storium.config.ts
 * const userStore = defineStore('users', columns, { queries: { search } })
 */

import type {
  Dialect,
  ColumnsConfig,
  TableDef,
  TableOptions,
  CustomQueryFn,
  AssertionRegistry,
} from './types'
import { buildDefineTable } from './defineTable'
import { loadDialectFromConfig } from './configLoader'

// --------------------------------------------------------------- Types --

/**
 * Options for the one-call defineStore overloads.
 * Combines TableOptions (indexes, timestamps, etc.) with a queries field.
 */
export type StoreOptions<
  TQueries extends Record<string, CustomQueryFn> = {}
> = TableOptions & {
  queries?: TQueries
}

/**
 * A store definition: a TableDef bundled with custom query functions.
 * This is an inert data structure — pass it to `db.register()` to
 * get a live store with CRUD + query methods.
 *
 * Surfaces `.table` and `.name` from the inner TableDef so that
 * schemaCollector can detect StoreDefinition exports the same way
 * it detects TableDef exports.
 */
export type StoreDefinition<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
> = {
  readonly __storeDefinition: true
  tableDef: TableDef<TColumns>
  queries: TQueries
  /** The Drizzle table object (pass-through from tableDef). */
  table: any
  /** The table name (pass-through from tableDef). */
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

const DIALECTS = new Set<string>(['postgresql', 'mysql', 'sqlite', 'memory'])

/**
 * Build a dialect-bound defineStore function. Used internally by the
 * `defineStore()` overloads and by `connect()` to create the instance-bound
 * version.
 */
export const buildDefineStore = (
  dialect: Dialect,
  assertions: AssertionRegistry = {}
) => {
  const boundDefineTable = buildDefineTable(dialect, assertions)

  const boundDefineStore = <
    TColumns extends ColumnsConfig,
    TQueries extends Record<string, CustomQueryFn> = {}
  >(
    name: string,
    columns: TColumns,
    options: StoreOptions<TQueries> = {} as StoreOptions<TQueries>
  ): StoreDefinition<TColumns, TQueries> => {
    const { queries, ...tableOptions } = options
    const tableDef = boundDefineTable(name, columns, tableOptions)
    return makeStoreDefinition(tableDef, (queries ?? {}) as TQueries)
  }

  return boundDefineStore
}

/**
 * Create a StoreDefinition from a TableDef and queries.
 * Surfaces .table and .name for schemaCollector compatibility.
 */
const makeStoreDefinition = <
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
>(
  tableDef: TableDef<TColumns>,
  queries: TQueries
): StoreDefinition<TColumns, TQueries> => ({
  __storeDefinition: true as const,
  tableDef,
  queries,
  table: tableDef.table,
  name: tableDef.name,
})

// -------------------------------------------------------- Public API --

type BoundDefineStore = <
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
>(
  name: string,
  columns: TColumns,
  options?: StoreOptions<TQueries>
) => StoreDefinition<TColumns, TQueries>

/**
 * Define a store — bundles schema + custom queries into a StoreDefinition.
 *
 * Three call signatures:
 *
 * 1. `defineStore(tableDef, { queries })` — wrap a pre-built TableDef
 * 2. `defineStore('postgresql')('users', columns, { queries })` — explicit dialect, curried
 * 3. `defineStore('users', columns, { queries })` — auto-loads dialect from config
 */
export function defineStore<
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
>(
  tableDef: TableDef<TColumns>,
  queries?: TQueries
): StoreDefinition<TColumns, TQueries>

export function defineStore(dialect: Dialect): BoundDefineStore

export function defineStore<
  TColumns extends ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
>(
  name: string,
  columns: TColumns,
  options?: StoreOptions<TQueries>
): StoreDefinition<TColumns, TQueries>

export function defineStore(first?: any, second?: any, third?: any) {
  // Overload 2: dialect string → return curried bound function.
  // Only matches when no columns are provided (second is undefined).
  // Note: table names that match a dialect string ('postgresql', 'mysql',
  // 'sqlite', 'memory') are therefore reserved and cannot be used as table names.
  if (typeof first === 'string' && DIALECTS.has(first) && second === undefined) {
    return buildDefineStore(first as Dialect)
  }

  // Overload 1: first is a TableDef (has .table property)
  if (typeof first === 'object' && first !== null && 'table' in first) {
    return makeStoreDefinition(first, (second ?? {}) as any)
  }

  // Overload 3: first is a table name string → auto-load dialect
  if (typeof first === 'string') {
    return buildDefineStore(loadDialectFromConfig())(first, second, third)
  }

  throw new Error(
    'defineStore(): invalid arguments. Expected (tableDef, queries), ' +
    '(dialect), or (name, columns, options).'
  )
}
