/**
 * Storium v1 — defineStore
 *
 * The primary entry point for defining a data store. Combines `defineTable`
 * (schema + indexes) with `createRepository` (CRUD + custom queries) into
 * a single call.
 *
 * The returned Store object IS a TableDef (can be passed to withBelongsTo,
 * withMembers, foreign key references, etc.) AND has repository methods
 * directly on it.
 *
 * For circular dependency cases where schema must be separated from queries,
 * use `defineTable()` first, then `defineStore(tableDef, queries)` to add
 * queries later — pass the pre-built TableDef as the first argument.
 *
 * @example
 * const users = db.defineStore('users', {
 *   id:    { type: 'uuid', primaryKey: true, default: 'random_uuid' },
 *   email: { type: 'varchar', maxLength: 255, notNull: true, mutable: true },
 *   name:  { type: 'varchar', maxLength: 255, mutable: true },
 * }, {
 *   indexes: { email: { unique: true } },
 *   queries: {
 *     findByEmail: (ctx) => async (email) => ctx.findOne({ email }),
 *   },
 * })
 *
 * // Use as a repository:
 * await users.findById('123')
 * await users.findByEmail('alice@example.com')
 *
 * // Use as a TableDef:
 * withBelongsTo(users, 'user_id')
 */

import type {
  Dialect,
  ColumnsConfig,
  TableDef,
  StoreOptions,
  CustomQueryFn,
  AssertionRegistry,
  DefineStoreFn,
} from './types'
import { createDefineTable } from './defineTable'
import { createCreateRepository } from './createRepository'

// -------------------------------------------------------- Public API --

/**
 * Create a `defineStore` function bound to a specific dialect, db instance,
 * and assertion registry.
 *
 * This is called internally by `connect()` to produce the instance-bound version.
 */
export const createDefineStore = (
  dialect: Dialect,
  db: any,
  assertions: AssertionRegistry = {}
) => {
  const defineTable = createDefineTable(dialect, assertions)
  const createRepository = createCreateRepository(db, assertions)

  /**
   * Define a data store: table schema + indexes + CRUD + custom queries.
   *
   * Overload 1: `(name, columns, options?)` — define schema + queries in one step.
   * Overload 2: `(tableDef, queries?)` — wrap a pre-built TableDef with queries.
   *
   * @returns Store / Repository (TableDef + CRUD + custom queries)
   */
  const defineStore: DefineStoreFn = (
    nameOrTableDef: string | TableDef,
    columnsOrQueries?: ColumnsConfig | Record<string, CustomQueryFn>,
    options: StoreOptions & { queries?: Record<string, CustomQueryFn> } = {}
  ): any => {
    if (typeof nameOrTableDef === 'string') {
      // Overload 1: name + columns
      const { queries = {}, ...tableOptions } = options
      const tableDef = defineTable(nameOrTableDef, columnsOrQueries as ColumnsConfig, tableOptions)
      return createRepository(tableDef, queries)
    } else {
      // Overload 2: pre-built TableDef + queries
      const queries = (columnsOrQueries ?? {}) as Record<string, CustomQueryFn>
      return createRepository(nameOrTableDef, queries)
    }
  }

  return defineStore
}
