/**
 * @module hasMany
 *
 * Composable "has many" mixin. Generates a `find{Alias}For` query that
 * returns a flat array of related rows for a given parent entity ID.
 *
 * @example
 * const authors = db.defineStore(authorsTable).queries({
 *   ...hasMany(postsTable, 'author_id', { alias: 'posts' }),
 * })
 *
 * const posts = await authors.findPostsFor(authorId)
 * // [{ id, title, author_id }, ...]
 *
 * @remarks `ctx: any` in return types is intentional — mixin query
 * factories must compose with arbitrary repository contexts without
 * introducing circular imports between mixins and types.ts.
 */

import { eq, and, asc, desc, isNull, type SQL, type Column } from 'drizzle-orm'
import type { TableDef, OrderBySpec } from '../types'
import { StoreError } from '../errors'

// -------------------------------------------------- Shared Relation Helpers --

/**
 * Build a column select object for a related table query.
 */
export function buildRelatedSelect(
  relatedTable: TableDef,
  columns: string[]
): Record<string, Column> {
  const selectObj: Record<string, Column> = {}
  for (const col of columns) {
    if (!(col in relatedTable)) {
      throw new StoreError(
        `Unknown column '${col}' on related table '${relatedTable.storium.name}'. ` +
        `Valid columns: ${relatedTable.storium.access.selectable.join(', ')}`
      )
    }
    selectObj[col] = relatedTable[col]
  }
  return selectObj
}

/**
 * Build a WHERE clause for a related table query, combining
 * the foreign key condition with an optional where callback.
 */
export function buildRelatedWhere(
  relatedTable: TableDef,
  foreignKey: string,
  id: string | number,
  opts?: { where?: (t: any) => SQL | undefined }
) {
  const conditions = [eq(relatedTable[foreignKey], id)]
  if (relatedTable.storium?.softDelete && 'deletedAt' in relatedTable) {
    conditions.push(isNull(relatedTable.deletedAt))
  }
  if (opts?.where) {
    const clause = opts.where(relatedTable)
    if (clause) conditions.push(clause)
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

/**
 * Extract common setup for hasMany/hasOne: resolve table, method name,
 * and selectable columns from options.
 */
export function prepareRelatedMixin(
  relatedTableDef: TableDef,
  options: { alias: string; select?: string[] }
) {
  const alias = options.alias
  const methodName = `find${alias.charAt(0).toUpperCase()}${alias.slice(1)}For`
  return {
    relatedTable: relatedTableDef,
    methodName,
    columns: options.select ?? relatedTableDef.storium.access.selectable,
  }
}

// ------------------------------------------------------------ hasMany --

type HasManyOptions<A extends string = string> = {
  /** The alias for the related collection (used in the method name: find{Alias}For). */
  alias: A
  /** Which columns to select from the related table. If omitted, uses all selectable columns. */
  select?: string[]
}

/**
 * Generate a "has many" query for a related table.
 *
 * @param relatedTableDef - The TableDef of the related entity
 * @param foreignKey - The column on the related table referencing the parent entity's PK
 * @param options - Alias and optional column selection
 * @returns A custom query function to spread into queries
 */
export const hasMany = <A extends string>(
  relatedTableDef: TableDef,
  foreignKey: string,
  options: HasManyOptions<A>
): { [K in `find${Capitalize<A>}For`]: (ctx: any) => (id: string | number, opts?: any) => Promise<any[]> } => {
  const { relatedTable, methodName, columns: relatedColumns } = prepareRelatedMixin(relatedTableDef, options)

  return {
    /**
     * Find all related rows for a given parent entity ID.
     * Supports limit, offset, orderBy, and where callback opts.
     */
    [methodName]: (_ctx: any) => async (id: string | number, opts?: any) => {
      const selectObj = buildRelatedSelect(relatedTable, relatedColumns)
      const whereClause = buildRelatedWhere(relatedTable, foreignKey, id, opts)

      let q = _ctx.drizzle
        .select(selectObj)
        .from(relatedTable)
        .where(whereClause)

      if (opts?.orderBy) {
        const specs = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy]
        const clauses = specs.map((spec: OrderBySpec) =>
          (spec.direction === 'desc' ? desc : asc)(relatedTable[spec.column])
        )
        q = q.orderBy(...clauses)
      }

      if (opts?.limit !== undefined) q = q.limit(opts.limit)
      if (opts?.offset !== undefined) q = q.offset(opts.offset)

      return q
    },
  } as { [K in `find${Capitalize<A>}For`]: (ctx: any) => (id: string | number, opts?: any) => Promise<any[]> }
}
