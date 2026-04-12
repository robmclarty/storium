/**
 * @module createRepository
 *
 * The repository factory. Takes a Drizzle database instance, a TableDef
 * (Drizzle table with .storium metadata), and optional custom query functions.
 * Returns a repository object with default CRUD operations + any customs.
 *
 * Custom queries receive `ctx` containing the original default operations,
 * enabling composition and overrides. If a custom query has the same name
 * as a default (e.g., `create`), it overrides the default on the returned
 * object, but `ctx.create` still references the original.
 */

import { eq, and, or, inArray, asc, desc, sql, count as drizzleCount, isNull, type SQL, type Table } from 'drizzle-orm'
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
} from '../types'
import { StoreError } from '../errors'
import { createPrepFn } from './prep'

// -------------------------------------------------------------- Helpers --

/**
 * Whether the dialect supports RETURNING clauses on INSERT/UPDATE/DELETE.
 */
export const supportsReturning = (dialect: Dialect): boolean =>
  dialect !== 'mysql'

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
 */
const buildDefaultCrud = (
  db: any,
  tableDef: TableDef,
  assertions: AssertionRegistry,
  dialect: Dialect
) => {
  const { selectColumns, allColumns, primaryKey: rawPk, access, annotations, name: tableName } = tableDef.storium
  const softDelete = tableDef.storium.softDelete === true
  if (rawPk === undefined) {
    throw new StoreError(
      `Table '${tableName}' has no primary key. Define a primary key in your Drizzle table definition.`
    )
  }
  const primaryKey: string | string[] = rawPk
  const table = tableDef
  const prep = createPrepFn(tableDef, annotations, access, assertions)
  const validColumns = new Set(Object.keys(allColumns))

  /**
   * Get the query builder, optionally scoped to a transaction.
   */
  const getDb = (opts?: PrepOptions) =>
    opts?.tx ?? db

  /**
   * Return the column map for SELECT/RETURNING clauses.
   */
  const getCols = (opts?: PrepOptions) =>
    opts?.includeHidden ? allColumns : selectColumns

  /**
   * Apply orderBy clauses to a query builder.
   *
   * @remarks `q` is typed as `any` because Drizzle's fluent query builder
   * type varies by dialect and is not publicly exported. All dialects
   * expose `.orderBy()`, so the runtime call is safe.
   */
  const applyOrderBy = (q: any, orderBy: OrderBySpec | OrderBySpec[]) => {
    const specs = Array.isArray(orderBy) ? orderBy : [orderBy]
    const clauses = specs.map(spec =>
      (spec.direction === 'desc' ? desc : asc)(table[spec.column])
    )
    return q.orderBy(...clauses)
  }

  /**
   * Build a combined WHERE clause from equality filters and an optional
   * `where` callback in opts. When soft delete is enabled, automatically
   * adds `deletedAt IS NULL` unless `skipSoftDelete` is true.
   */
  const buildWhere = (filters: Record<string, any>, opts?: PrepOptions, skipSoftDelete = false) => {
    const conditions: SQL[] = []

    if (softDelete && !skipSoftDelete) {
      conditions.push(isNull(table.deletedAt))
    }

    for (const [key, value] of Object.entries(filters)) {
      if (!validColumns.has(key)) {
        throw new StoreError(
          `Unknown filter key '${key}' on table '${tableName}'. ` +
          `Valid columns: ${[...validColumns].join(', ')}`
        )
      }
      conditions.push(eq(table[key], value))
    }

    if (opts?.where) {
      const clause = opts.where(table)
      if (clause) conditions.push(clause)
    }

    if (conditions.length === 0) return undefined
    return conditions.length === 1 ? conditions[0] : and(...conditions)
  }

  /**
   * Apply orderBy, limit, and offset options to a query builder.
   *
   * @remarks `q` is typed as `any` — see `applyOrderBy` remark above.
   */
  const applyQueryOpts = (q: any, opts?: PrepOptions) => {
    if (opts?.orderBy) q = applyOrderBy(q, opts.orderBy)
    if (opts?.limit !== undefined) q = q.limit(opts.limit)
    if (opts?.offset !== undefined) q = q.offset(opts.offset)
    return q
  }

  /**
   * Throw if filters are empty and no where clause is provided.
   */
  const requireFilters = (method: string, filters: Record<string, any>, opts?: PrepOptions) => {
    if (Object.keys(filters).length === 0 && !opts?.where) {
      throw new StoreError(
        `${method}() requires at least one filter or a where clause.` +
        (method === 'find' ? ' Use findAll() to retrieve all rows.' : '')
      )
    }
  }

  /**
   * Run an UPDATE with RETURNING (PostgreSQL/SQLite) or fall back to
   * UPDATE + SELECT for MySQL. Returns the updated row or throws.
   */
  const updateAndReturn = async (
    values: Record<string, any>,
    id: PkValue,
    errorPrefix: string,
    opts?: PrepOptions
  ) => {
    if (supportsReturning(dialect)) {
      const rows = await getDb(opts)
        .update(table)
        .set(values)
        .where(buildPkWhere(table, primaryKey, id))
        .returning(getCols(opts))

      if (!rows[0]) {
        throw new StoreError(
          `${errorPrefix}: no '${tableName}' row with ${primaryKey} = ${id}.`
        )
      }
      return rows[0]
    }

    // MySQL: no RETURNING support — update then select back
    await getDb(opts)
      .update(table)
      .set(values)
      .where(buildPkWhere(table, primaryKey, id))

    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildPkWhere(table, primaryKey, id))
      .limit(1)

    if (!rows[0]) {
      throw new StoreError(
        `${errorPrefix}: no '${tableName}' row with ${primaryKey} = ${id}.`
      )
    }
    return rows[0]
  }

  const find = async (filters: Record<string, any>, opts?: PrepOptions) => {
    requireFilters('find', filters, opts)

    const q = getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildWhere(filters, opts))

    return applyQueryOpts(q, opts)
  }

  const findAll = async (opts?: PrepOptions) => {
    let q = getDb(opts).select(getCols(opts)).from(table)

    const conditions: SQL[] = []
    if (softDelete) conditions.push(isNull(table.deletedAt))
    if (opts?.where) {
      const clause = opts.where(table)
      if (clause) conditions.push(clause)
    }
    if (conditions.length > 0) {
      q = q.where(conditions.length === 1 ? conditions[0] : and(...conditions))
    }

    return applyQueryOpts(q, opts)
  }

  const findOne = async (filters: Record<string, any>, opts?: PrepOptions) => {
    const rows = await find(filters, opts)
    return rows[0] ?? null
  }

  const findById = async (id: PkValue, opts?: PrepOptions) => {
    const pkCondition = buildPkWhere(table, primaryKey, id)
    const where = softDelete
      ? and(pkCondition, isNull(table.deletedAt))
      : pkCondition

    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(where)
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

    const inCondition = inArray(table[primaryKey], ids)
    const where = softDelete
      ? and(inCondition, isNull(table.deletedAt))
      : inCondition

    let q = getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(where)

    if (opts?.orderBy) q = applyOrderBy(q, opts.orderBy)

    return q
  }

  const create = async (input: Record<string, any>, opts?: PrepOptions) => {
    const prepared = await prep(input, {
      skipPrep: opts?.skipPrep ?? false,
      validateRequired: true,
      onlyWritable: false,
    })

    if (supportsReturning(dialect)) {
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

    // Single PK: Drizzle's $defaultFn handles UUID generation.
    // The PK value should be in `prepared` (user-provided) or generated by Drizzle.
    const result = await getDb(opts).insert(table).values(prepared)
    // `(result as any).insertId` — Drizzle's MySQL insert result exposes
    // insertId but the type is not publicly exported; this is the only
    // way to retrieve auto-increment PKs on MySQL without RETURNING.
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
      skipPrep: opts?.skipPrep ?? false,
      validateRequired: false,
      onlyWritable: true,
    })

    return updateAndReturn(prepared, id, `update(): UPDATE on '${tableName}' matched no row with`, opts)
  }

  const destroy = async (id: PkValue, opts?: PrepOptions) => {
    if (supportsReturning(dialect)) {
      const rows = await getDb(opts)
        .delete(table)
        .where(buildPkWhere(table, primaryKey, id))
        .returning()
      if (!rows[0]) {
        throw new StoreError(
          `destroy(): no '${tableName}' row with ${primaryKey} = ${id}.`
        )
      }
      return
    }

    // MySQL: check affected rows
    const result = await getDb(opts)
      .delete(table)
      .where(buildPkWhere(table, primaryKey, id))
    if ((result.affectedRows ?? 0) === 0) {
      throw new StoreError(
        `destroy(): no '${tableName}' row with ${primaryKey} = ${id}.`
      )
    }
  }

  const destroyAll = async (filters: Record<string, any>, opts?: PrepOptions) => {
    requireFilters('destroyAll', filters, opts)

    const result = await getDb(opts)
      .delete(table)
      .where(buildWhere(filters, opts))

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
    // `(row as any)[primaryKey]` — dynamic property access on the result
    // row using a runtime PK name. The row type is unknown since it depends
    // on the table's SELECT projection.
    if (Array.isArray(primaryKey)) {
      return primaryKey.map(col => (row as any)[col])
    }
    return (row as any)[primaryKey]
  }

  const count = async (filters: Record<string, any> = {}, opts?: PrepOptions) => {
    const where = buildWhere(filters, opts)

    let q = getDb(opts)
      .select({ count: drizzleCount() })
      .from(table)

    if (where) q = q.where(where)

    const rows = await q
    return rows[0]?.count ?? 0
  }

  const exists = async (filters: Record<string, any>, opts?: PrepOptions) => {
    const entries = Object.entries(filters)

    if (entries.length === 0 && !opts?.where) {
      throw new StoreError(
        'exists() requires at least one filter or a where clause.'
      )
    }

    const rows = await getDb(opts)
      .select({ exists: sql<number>`1` })
      .from(table)
      .where(buildWhere(filters, opts))
      .limit(1)

    return rows.length > 0
  }

  const createMany = async (inputs: Record<string, any>[], opts?: PrepOptions) => {
    if (inputs.length === 0) return []

    const preparedRows = await Promise.all(
      inputs.map(input => prep(input, {
        skipPrep: opts?.skipPrep ?? false,
        validateRequired: true,
        onlyWritable: false,
      }))
    )

    if (supportsReturning(dialect)) {
      return getDb(opts)
        .insert(table)
        .values(preparedRows)
        .returning(getCols(opts))
    }

    // MySQL: no RETURNING — insert then select back by PKs
    await getDb(opts).insert(table).values(preparedRows)

    if (Array.isArray(primaryKey)) {
      // Composite PK: build OR'd compound WHERE clauses
      const conditions = preparedRows.map(r => {
        const pkValues = primaryKey.map(col => r[col])
        return buildPkWhere(table, primaryKey, pkValues)
      })
      return getDb(opts)
        .select(getCols(opts))
        .from(table)
        .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    }

    // Single PK
    const pkValues = preparedRows.map(r => r[primaryKey]).filter(Boolean)
    if (pkValues.length === 0) return []

    return getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(inArray(table[primaryKey], pkValues))
  }

  const upsert = async (input: Record<string, any>, opts?: PrepOptions) => {
    const prepared = await prep(input, {
      skipPrep: opts?.skipPrep ?? false,
      validateRequired: true,
      onlyWritable: false,
    })

    // Determine conflict target columns
    const target = opts?.conflictTarget
      ? opts.conflictTarget.map(col => table[col])
      : Array.isArray(primaryKey)
        ? primaryKey.map(col => table[col])
        : [table[primaryKey]]

    // Build the SET clause: all writable columns except the conflict target
    const targetNames = new Set(opts?.conflictTarget ?? (Array.isArray(primaryKey) ? primaryKey : [primaryKey]))
    const setFields: Record<string, any> = {}
    for (const key of access.writable) {
      if (!targetNames.has(key) && key in prepared) {
        setFields[key] = prepared[key]
      }
    }

    if (supportsReturning(dialect)) {
      const rows = await getDb(opts)
        .insert(table)
        .values(prepared)
        .onConflictDoUpdate({ target, set: setFields })
        .returning(getCols(opts))

      if (!rows[0]) {
        throw new StoreError(
          `upsert(): INSERT OR UPDATE on '${tableName}' returned no rows.`
        )
      }

      return rows[0]
    }

    // MySQL: ON DUPLICATE KEY UPDATE
    await getDb(opts)
      .insert(table)
      .values(prepared)
      .onDuplicateKeyUpdate({ set: setFields })

    const lookupFilters: Record<string, any> = {}
    for (const col of targetNames) {
      lookupFilters[col] = prepared[col]
    }
    const rows = await getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(buildWhere(lookupFilters))
      .limit(1)

    if (!rows[0]) {
      throw new StoreError(
        `upsert(): INSERT OR UPDATE on '${tableName}' succeeded but the follow-up SELECT found no row.`
      )
    }

    return rows[0]
  }

  // Soft delete overrides
  if (softDelete) {
    const hardDestroy = destroy
    const hardDestroyAll = destroyAll

    const softDestroy = async (id: PkValue, opts?: PrepOptions) => {
      if (supportsReturning(dialect)) {
        const rows = await getDb(opts)
          .update(table)
          .set({ deletedAt: new Date() })
          .where(buildPkWhere(table, primaryKey, id))
          .returning()
        if (!rows[0]) {
          throw new StoreError(
            `destroy(): no '${tableName}' row with ${primaryKey} = ${id}.`
          )
        }
        return
      }

      // MySQL: check affected rows
      const result = await getDb(opts)
        .update(table)
        .set({ deletedAt: new Date() })
        .where(buildPkWhere(table, primaryKey, id))
      if ((result.affectedRows ?? 0) === 0) {
        throw new StoreError(
          `destroy(): no '${tableName}' row with ${primaryKey} = ${id}.`
        )
      }
    }

    const softDestroyAll = async (filters: Record<string, any>, opts?: PrepOptions) => {
      requireFilters('destroyAll', filters, opts)

      const result = await getDb(opts)
        .update(table)
        .set({ deletedAt: new Date() })
        .where(buildWhere(filters, opts))

      return result.rowCount ?? result.affectedRows ?? result.changes ?? 0
    }

    const restore = async (id: PkValue, opts?: PrepOptions) => {
      return updateAndReturn({ deletedAt: null }, id, 'restore()', opts)
    }

    const countWithDeleted = async (filters: Record<string, any> = {}, opts?: PrepOptions) => {
      const where = buildWhere(filters, opts, true)

      let q = getDb(opts)
        .select({ count: drizzleCount() })
        .from(table)

      if (where) q = q.where(where)

      const rows = await q
      return rows[0]?.count ?? 0
    }

    const findWithDeleted = async (filters?: Record<string, any>, opts?: PrepOptions) => {
      if (!filters || Object.keys(filters).length === 0) {
        let q = getDb(opts).select(getCols(opts)).from(table)
        if (opts?.where) q = q.where(opts.where(table))
        return applyQueryOpts(q, opts)
      }

      const q = getDb(opts)
        .select(getCols(opts))
        .from(table)
        .where(buildWhere(filters, opts, true))

      return applyQueryOpts(q, opts)
    }

    return {
      prep,
      find,
      findAll,
      findOne,
      findById,
      findByIdIn,
      create,
      createMany,
      update,
      upsert,
      destroy: softDestroy,
      destroyAll: softDestroyAll,
      count,
      exists,
      ref,
      restore,
      forceDestroy: hardDestroy,
      forceDestroyAll: hardDestroyAll,
      findWithDeleted,
      countWithDeleted,
    }
  }

  return {
    prep,
    find,
    findAll,
    findOne,
    findById,
    findByIdIn,
    create,
    createMany,
    update,
    upsert,
    destroy,
    destroyAll,
    count,
    exists,
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
   */
  const createRepository = <TTable extends Table = Table, TQueries extends QueriesConfig = {}>(
    tableDef: TableDef,
    queries: TQueries = {} as TQueries
  ): Repository<TTable, TQueries> => {

    // Step 1: Build default CRUD operations
    const defaults = buildDefaultCrud(db, tableDef, assertions, dialect)

    // Step 2: Assemble ctx with defaults + metadata
    const meta = tableDef.storium
    const ctx = {
      drizzle: db,
      zod: z,
      dialect,
      table: tableDef,
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
      createMany: defaults.createMany,
      update: defaults.update,
      upsert: defaults.upsert,
      destroy: defaults.destroy,
      destroyAll: defaults.destroyAll,
      count: defaults.count,
      exists: defaults.exists,
      ref: defaults.ref,
    }

    // Step 3: Invoke each custom query function with ctx
    const customs: Record<string, any> = {}

    for (const [key, queryFn] of Object.entries(queries)) {
      if (typeof queryFn === 'function') {
        customs[key] = queryFn(ctx as any)
      }
    }

    // Step 4: Merge — customs override defaults by name.
    const { prep: _prep, ...crudMethods } = defaults

    const repository = {
      name: meta.name,
      schemas: meta.schemas,

      // Default CRUD (overridden by customs where names match)
      ...crudMethods,

      // Custom queries (win on name collision)
      ...customs,
    }

    return repository as unknown as Repository<TTable, TQueries>
  }

  return createRepository
}
