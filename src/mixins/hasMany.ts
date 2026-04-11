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
 */

import { eq, and, asc, desc } from 'drizzle-orm'
import type { TableDef } from '../core/types'

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
  const { alias, select: selectFields } = options
  const relatedTable = relatedTableDef
  const meta = relatedTableDef.storium

  // Capitalize first letter for method name: 'posts' → 'findPostsFor'
  const methodName = `find${alias.charAt(0).toUpperCase()}${alias.slice(1)}For`

  // Determine which related columns to include
  const relatedColumns = selectFields ?? meta.access.selectable

  const buildSelectObj = () => {
    const selectObj: Record<string, any> = {}
    for (const col of relatedColumns) {
      if (col in relatedTable) {
        selectObj[col] = relatedTable[col]
      }
    }
    return selectObj
  }

  return {
    /**
     * Find all related rows for a given parent entity ID.
     * Supports limit, offset, orderBy, and where callback opts.
     */
    [methodName]: (_ctx: any) => async (id: string | number, opts?: any) => {
      const selectObj = buildSelectObj()

      const conditions = [eq(relatedTable[foreignKey], id)]
      if (opts?.where) conditions.push(opts.where(relatedTable))
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

      let q = _ctx.drizzle
        .select(selectObj)
        .from(relatedTable)
        .where(whereClause)

      if (opts?.orderBy) {
        const specs = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy]
        const clauses = specs.map((spec: any) =>
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
