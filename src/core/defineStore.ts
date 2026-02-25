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
 * use `defineTable()` + `createRepository()` instead.
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
  StoreOptions,
  CustomQueryFn,
  Store,
  AssertionRegistry,
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
   * @param name - Database table name
   * @param columns - Flat column definitions
   * @param options - Indexes, queries, constraints, timestamps, primary key
   * @returns Store (TableDef + CRUD + custom queries)
   */
  const defineStore = <
    TColumns extends ColumnsConfig,
    TQueries extends Record<string, CustomQueryFn> = {}
  >(
    name: string,
    columns: TColumns,
    options: StoreOptions & { queries?: TQueries } = {}
  ): Store<TColumns, TQueries> => {

    // Extract queries from options; pass the rest to defineTable
    const { queries = {} as TQueries, ...tableOptions } = options

    // Step 1: Define the table (schema + indexes + constraints)
    const tableDef = defineTable(name, columns, tableOptions)

    // Step 2: Create the repository (CRUD + custom queries)
    const repository = createRepository(tableDef, queries)

    // The repository already includes all TableDef properties,
    // so it satisfies both TableDef and Store interfaces.
    return repository as Store<TColumns, TQueries>
  }

  return defineStore
}
