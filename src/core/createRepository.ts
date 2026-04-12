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

import { eq, and, inArray, asc, desc, sql, count as drizzleCount, isNull } from 'drizzle-orm'
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
import { uuidv7 } from './uuidv7'

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
  const { selectColumns, allColumns, primaryKey: rawPk, access, columns, name: tableName } = tableDef.storium
  const softDelete = tableDef.storium.softDelete === true
  if (rawPk === undefined) {
    throw new StoreError(
      `Table '${tableName}' has no primary key. Define a column with ` +
      '`primaryKey: true`, include an `id` column, or use `.primaryKey()`.'
    )
  }
  const primaryKey: string | string[] = rawPk
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

  /**
   * Build a combined WHERE clause from equality filters and an optional
   * `where` callback in opts. Returns undefined if no conditions exist.
   * When soft delete is enabled, automatically adds `deletedAt IS NULL`
   * unless `skipSoftDelete` is true.
   */
  const buildWhere = (filters: Record<string, any>, opts?: PrepOptions, skipSoftDelete = false) => {
    const conditions: any[] = []

    // Auto-filter soft-deleted rows unless explicitly skipped
    if (softDelete && !skipSoftDelete) {
      conditions.push(isNull(table.deletedAt))
    }

    for (const [key, value] of Object.entries(filters)) {
      conditions.push(eq(table[key], value))
    }

    if (opts?.where) {
      conditions.push(opts.where(table))
    }

    if (conditions.length === 0) return undefined
    return conditions.length === 1 ? conditions[0] : and(...conditions)
  }

  /**
   * Apply orderBy, limit, and offset options to a query builder.
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
    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
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

    const conditions: any[] = []
    if (softDelete) conditions.push(isNull(table.deletedAt))
    if (opts?.where) conditions.push(opts.where(table))
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
    if (!prepared[primaryKey] && pkColumn && !isRawColumn(pkColumn)) {
      if (pkColumn.default === 'uuid:v4') prepared[primaryKey] = crypto.randomUUID()
      else if (pkColumn.default === 'uuid:v7') prepared[primaryKey] = uuidv7()
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

    return updateAndReturn(prepared, id, `update(): UPDATE on '${tableName}' matched no row with`, opts)
  }

  const destroy = async (id: PkValue, opts?: PrepOptions) => {
    await getDb(opts)
      .delete(table)
      .where(buildPkWhere(table, primaryKey, id))
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
        force: opts?.force ?? false,
        validateRequired: true,
        onlyWritable: false,
      }))
    )

    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
      return getDb(opts)
        .insert(table)
        .values(preparedRows)
        .returning(getCols(opts))
    }

    // MySQL: no RETURNING — insert then select back by PKs
    const pkColumn = columns[primaryKey as string]
    for (const prepared of preparedRows) {
      if (!prepared[primaryKey as string] && pkColumn && !isRawColumn(pkColumn)) {
        if (pkColumn.default === 'uuid:v4') prepared[primaryKey as string] = crypto.randomUUID()
        else if (pkColumn.default === 'uuid:v7') prepared[primaryKey as string] = uuidv7()
      }
    }

    await getDb(opts).insert(table).values(preparedRows)

    const pkValues = preparedRows.map(r => r[primaryKey as string]).filter(Boolean)
    if (pkValues.length === 0) return []

    return getDb(opts)
      .select(getCols(opts))
      .from(table)
      .where(inArray(table[primaryKey as string], pkValues))
  }

  const upsert = async (input: Record<string, any>, opts?: PrepOptions) => {
    const prepared = await prep(input, {
      force: opts?.force ?? false,
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

    // Handle updatedAt if present and using timestamps
    if ('updatedAt' in columns && !targetNames.has('updatedAt')) {
      setFields.updatedAt = new Date()
    }

    if (dialect === 'postgresql' || dialect === 'sqlite' || dialect === 'memory') {
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

    // Select back by conflict target values
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
      await getDb(opts)
        .update(table)
        .set({ deletedAt: new Date() })
        .where(buildPkWhere(table, primaryKey, id))
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

    const findWithDeleted = async (filters?: Record<string, any>, opts?: PrepOptions) => {
      if (!filters || Object.keys(filters).length === 0) {
        // findAll variant — no filters
        let q = getDb(opts).select(getCols(opts)).from(table)
        if (opts?.where) q = q.where(opts.where(table))
        return applyQueryOpts(q, opts)
      }

      // find variant — with filters, but no soft delete filter
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
      name: meta.name,
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
