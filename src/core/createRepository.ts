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
  CustomQueryFn,
  PrepOptions,
  OrderBySpec,
  Repository,
  AssertionRegistry,
} from './types'
import { isRawColumn } from './types'
import { StoreError } from './errors'
import { createPrepFn } from './prep'

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
   * Normally returns selectColumns (excludes writeOnly); when
   * `includeWriteOnly` is set, returns the full column map.
   */
  const getCols = (opts?: PrepOptions) =>
    opts?.includeWriteOnly ? allColumns : selectColumns

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

  const findById = async (id: string | number, opts?: PrepOptions) => {
    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(eq(table[primaryKey], id))
      .limit(1)

    return rows[0] ?? null
  }

  const findByIdIn = async (ids: (string | number)[], opts?: PrepOptions) => {
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
      onlyMutables: false,
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
    // This always costs 2 queries (INSERT + SELECT). The PK is resolved via
    // a short-circuit — the first truthy value wins, no extra queries:
    //
    // Scenario 1 — Explicit PK (e.g. UUID provided by the caller):
    //   prepared[primaryKey] is the UUID string → stops here. 2 queries total.
    //
    // Scenario 2 — UUID with default: 'random_uuid' (no explicit PK):
    //   Generate the UUID client-side so we can SELECT it back after INSERT.
    //   Drizzle's $defaultFn does this too, but the value isn't accessible
    //   to us after insert — so we generate it ourselves.
    //
    // Scenario 3 — Auto-increment serial (PK generated by MySQL):
    //   prepared[primaryKey] is undefined, but mysql2 populates result.insertId
    //   with the generated integer → stops here. 2 queries total.
    const pkColumn = columns[primaryKey]
    if (!prepared[primaryKey] && pkColumn && !isRawColumn(pkColumn) && pkColumn.default === 'random_uuid') {
      prepared[primaryKey] = crypto.randomUUID()
    }

    const result = await getDb(opts).insert(table).values(prepared)
    const pk = prepared[primaryKey] ?? (result as any).insertId
    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(eq(table[primaryKey], pk))
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
    id: string | number,
    input: Record<string, any>,
    opts?: PrepOptions
  ) => {
    const prepared = await prep(input, {
      force: opts?.force ?? false,
      validateRequired: false,
      onlyMutables: true,
    })

    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
      const rows = await getDb(opts)
        .update(table)
        .set(prepared)
        .where(eq(table[primaryKey], id))
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
      .where(eq(table[primaryKey], id))

    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(eq(table[primaryKey], id))
      .limit(1)

    if (!rows[0]) {
      throw new StoreError(
        `update(): UPDATE on '${tableName}' matched no row with ${primaryKey} = ${id}.`
      )
    }

    return rows[0]
  }

  const destroy = async (id: string | number, opts?: PrepOptions) => {
    await getDb(opts)
      .delete(table)
      .where(eq(table[primaryKey], id))
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
    TQueries extends Record<string, CustomQueryFn> = {}
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
