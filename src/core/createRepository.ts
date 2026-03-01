/**
 * @module createRepository
 *
 * The repository factory. Takes a Drizzle database instance, a TableDef,
 * and optional custom query functions. Returns a repository object with
 * default CRUD operations + any customs.
 *
 * Custom queries receive `ctx` containing the original default operations,
 * enabling composition and overrides. If a custom query has the same name
 * as a default (e.g., `create`), it overrides the default on the returned
 * object, but `ctx.create` still references the original.
 *
 * @example
 * const userRepo = db.createRepository(usersTable, {
 *   findByEmail: (ctx) => async (email) =>
 *     ctx.drizzle.select(ctx.selectColumns).from(ctx.table)
 *       .where(eq(ctx.table.email, email)).then(r => r[0] ?? null),
 *
 *   create: (ctx) => async (input, opts) => {
 *     const hashed = { ...input, password: await hash(input.password) }
 *     return ctx.create(hashed, { ...opts, force: true })
 *   },
 * })
 */

import { eq, and, inArray, asc, desc } from 'drizzle-orm'
import { z } from 'zod'
import type {
  Dialect,
  TableDef,
  QueriesConfig,
  PrepOptions,
  OrderBySpec,
  Repository,
  AssertionRegistry,
  PkValue,
} from './types'
import { isRawColumn } from './types'
import { StoreError } from './errors'
import { createPrepFn } from './prep'

// -------------------------------------------------------------- Helpers --

/**
 * Build a WHERE clause for primary key lookup.
 * Handles both single-column and composite primary keys.
 */
const buildPkWhere = (
  table: any,
  primaryKey: string | string[],
  id: PkValue
) => {
  if (typeof primaryKey === 'string') {
    return eq(table[primaryKey], id as string | number)
  }
  const ids = id as (string | number)[]
  const conditions = primaryKey.map((col, i) => eq(table[col], ids[i]))
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

// ------------------------------------------------------- CRUD Builder --

/**
 * Build the default CRUD operations for a table.
 * These operations use the prep pipeline for input processing
 * and respect selectColumns for output.
 */
const buildDefaultCrud = (
  db: any,
  tableDef: TableDef,
  assertions: AssertionRegistry,
  dialect: Dialect
) => {
  const { selectColumns, allColumns, primaryKey, access, columns, name: tableName } = tableDef.storium
  const table = tableDef
  const prep = createPrepFn(columns, access, assertions)

  /**
   * Get the query builder, optionally scoped to a transaction.
   */
  const getDb = (opts?: PrepOptions) =>
    opts?.tx ?? db

  /**
   * Return the column map for SELECT/RETURNING clauses.
   * Normally returns selectColumns (excludes hidden); when
   * `includeHidden` is set, returns the full column map.
   */
  const getCols = (opts?: PrepOptions) =>
    opts?.includeHidden ? allColumns : selectColumns

  /**
   * Apply orderBy clauses to a query builder.
   */
  const applyOrderBy = (q: any, orderBy: OrderBySpec | OrderBySpec[]) => {
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy]
    const clauses = specs.map(spec =>
      (spec.direction === 'desc' ? desc : asc)(table[spec.column])
    )
    return q.orderBy(...clauses)
  }

  const find = async (filters: Record<string, any>, opts?: PrepOptions) => {
    const entries = Object.entries(filters)

    if (entries.length === 0) {
      throw new StoreError(
        'find() requires at least one filter. Use findAll() to retrieve all rows.'
      )
    }

    const whereConditions = entries.map(
      ([key, value]) => eq(table[key], value)
    )

    let q = getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))

    if (opts?.orderBy) q = applyOrderBy(q, opts.orderBy)
    if (opts?.limit !== undefined) q = q.limit(opts.limit)
    if (opts?.offset !== undefined) q = q.offset(opts.offset)

    return q
  }

  const findAll = async (opts?: PrepOptions) => {
    let q = getDb(opts).select(getCols(opts)).from(table)

    if (opts?.orderBy) q = applyOrderBy(q, opts.orderBy)
    if (opts?.limit !== undefined) q = q.limit(opts.limit)
    if (opts?.offset !== undefined) q = q.offset(opts.offset)

    return q
  }

  const findOne = async (filters: Record<string, any>, opts?: PrepOptions) => {
    const rows = await find(filters, opts)
    return rows[0] ?? null
  }

  const findById = async (id: PkValue, opts?: PrepOptions) => {
    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildPkWhere(table, primaryKey, id))
      .limit(1)

    return rows[0] ?? null
  }

  const findByIdIn = async (ids: (string | number)[], opts?: PrepOptions) => {
    if (Array.isArray(primaryKey)) {
      throw new StoreError(
        'findByIdIn() is not supported on tables with composite primary keys. Use find() with filters instead.'
      )
    }
    if (ids.length === 0) return []

    let q = getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(inArray(table[primaryKey], ids))

    if (opts?.orderBy) q = applyOrderBy(q, opts.orderBy)

    return q
  }

  const create = async (input: Record<string, any>, opts?: PrepOptions) => {
    const prepared = await prep(input, {
      force: opts?.force ?? false,
      validateRequired: true,
      onlyWritable: false,
    })

    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
      const rows = await getDb(opts)
        .insert(table)
        .values(prepared)
        .returning(getCols(opts))

      if (!rows[0]) {
        throw new StoreError(
          `create(): INSERT into '${tableName}' succeeded but returned no rows. ` +
          'The RETURNING clause produced an empty result.'
        )
      }

      return rows[0]
    }

    // MySQL has no RETURNING clause, so we insert then SELECT back by PK.
    if (Array.isArray(primaryKey)) {
      // Composite PK: all values must be in `prepared` — no auto-generation
      await getDb(opts).insert(table).values(prepared)
      const pkValues = primaryKey.map(col => prepared[col])
      const rows = await getDb(opts)
        .select(getCols(opts))
        .from(table)
        .where(buildPkWhere(table, primaryKey, pkValues))
        .limit(1)

      if (!rows[0]) {
        throw new StoreError(
          `create(): INSERT into '${tableName}' succeeded but the follow-up SELECT ` +
          `found no row with composite PK [${primaryKey.join(', ')}].`
        )
      }

      return rows[0]
    }

    // Single PK: resolve via prepared value, client-side UUID, or insertId
    const pkColumn = columns[primaryKey]
    if (!prepared[primaryKey] && pkColumn && !isRawColumn(pkColumn) && pkColumn.default === 'random_uuid') {
      prepared[primaryKey] = crypto.randomUUID()
    }

    const result = await getDb(opts).insert(table).values(prepared)
    const pk = prepared[primaryKey] ?? (result as any).insertId
    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildPkWhere(table, primaryKey, pk))
      .limit(1)

    if (!rows[0]) {
      throw new StoreError(
        `create(): INSERT into '${tableName}' succeeded but the follow-up SELECT ` +
        `found no row with ${primaryKey} = ${pk}.`
      )
    }

    return rows[0]
  }

  const update = async (
    id: PkValue,
    input: Record<string, any>,
    opts?: PrepOptions
  ) => {
    const prepared = await prep(input, {
      force: opts?.force ?? false,
      validateRequired: false,
      onlyWritable: true,
    })

    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
      const rows = await getDb(opts)
        .update(table)
        .set(prepared)
        .where(buildPkWhere(table, primaryKey, id))
        .returning(getCols(opts))

      if (!rows[0]) {
        throw new StoreError(
          `update(): UPDATE on '${tableName}' matched no row with ${primaryKey} = ${id}.`
        )
      }

      return rows[0]
    }

    // MySQL: no RETURNING support — update then select back
    await getDb(opts)
      .update(table)
      .set(prepared)
      .where(buildPkWhere(table, primaryKey, id))

    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildPkWhere(table, primaryKey, id))
      .limit(1)

    if (!rows[0]) {
      throw new StoreError(
        `update(): UPDATE on '${tableName}' matched no row with ${primaryKey} = ${id}.`
      )
    }

    return rows[0]
  }

  const destroy = async (id: PkValue, opts?: PrepOptions) => {
    await getDb(opts)
      .delete(table)
      .where(buildPkWhere(table, primaryKey, id))
  }

  const destroyAll = async (filters: Record<string, any>, opts?: PrepOptions) => {
    const entries = Object.entries(filters)

    if (entries.length === 0) {
      throw new StoreError(
        'destroyAll() requires at least one filter to prevent accidental deletion of all rows.'
      )
    }

    const whereConditions = entries.map(
      ([key, value]) => eq(table[key], value)
    )

    const result = await getDb(opts)
      .delete(table)
      .where(whereConditions.length === 1 ? whereConditions[0] : and(...whereConditions))

    return result.rowCount ?? result.affectedRows ?? result.changes ?? 0
  }

  const ref = async (filter: Record<string, any>, opts?: PrepOptions) => {
    const row = await findOne(filter, opts)
    if (!row) {
      const filterStr = Object.entries(filter)
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join(', ')
      throw new StoreError(
        `ref(): no '${tableName}' row where ${filterStr}`
      )
    }
    if (Array.isArray(primaryKey)) {
      return primaryKey.map(col => (row as any)[col])
    }
    return (row as any)[primaryKey]
  }

  return {
    prep,
    find,
    findAll,
    findOne,
    findById,
    findByIdIn,
    create,
    update,
    destroy,
    destroyAll,
    ref,
  }
}

// -------------------------------------------------------- Public API --

/**
 * Create a `createRepository` function bound to a specific db instance
 * and assertion registry.
 */
export const createCreateRepository = (
  db: any,
  assertions: AssertionRegistry = {},
  dialect: Dialect = 'postgresql'
) => {
  /**
   * Create a repository from a TableDef with optional custom queries.
   *
   * @param tableDef - The table definition from defineTable()
   * @param queries - Optional custom query functions
   * @returns Repository object with default CRUD + customs
   */
  const createRepository = <
    TTableDef extends TableDef,
    TQueries extends QueriesConfig = {}
  >(
    tableDef: TTableDef,
    queries: TQueries = {} as TQueries
  ): Repository<TTableDef, TQueries> => {

    // Step 1: Build default CRUD operations
    const defaults = buildDefaultCrud(db, tableDef, assertions, dialect)

    // Step 2: Assemble ctx with defaults + metadata
    // ctx always contains the ORIGINAL defaults, even if overridden by customs.
    const meta = tableDef.storium
    const ctx = {
      drizzle: db,
      zod: z,
      dialect,
      table: tableDef,
      tableDef,
      selectColumns: meta.selectColumns,
      allColumns: meta.allColumns,
      primaryKey: meta.primaryKey,
      schemas: meta.schemas,
      prep: defaults.prep,
      find: defaults.find,
      findAll: defaults.findAll,
      findOne: defaults.findOne,
      findById: defaults.findById,
      findByIdIn: defaults.findByIdIn,
      create: defaults.create,
      update: defaults.update,
      destroy: defaults.destroy,
      destroyAll: defaults.destroyAll,
      ref: defaults.ref,
    }

    // Step 3: Invoke each custom query function with ctx to produce
    // the actual query function.
    const customs: Record<string, any> = {}

    for (const [key, queryFn] of Object.entries(queries)) {
      if (typeof queryFn === 'function') {
        customs[key] = queryFn(ctx as any)
      }
    }

    // Step 4: Merge — customs override defaults by name.
    const { prep: _prep, ...crudMethods } = defaults

    const repository = {
      schemas: meta.schemas,

      // Default CRUD (overridden by customs where names match)
      ...crudMethods,

      // Custom queries (win on name collision)
      ...customs,
    }

    return repository as unknown as Repository<TTableDef, TQueries>
  }

  return createRepository
}
