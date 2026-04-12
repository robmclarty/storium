/**
 * @module hasOne
 *
 * Composable "has one" mixin. Generates a `find{Alias}For` query that
 * returns a single related row or null for a given parent entity ID.
 *
 * @example
 * const users = db.defineStore(usersTable).queries({
 *   ...hasOne(profilesTable, 'user_id', { alias: 'profile' }),
 * })
 *
 * const profile = await users.findProfileFor(userId)
 * // { id, user_id, bio, ... } | null
 */

import { eq, and } from 'drizzle-orm'
import type { TableDef } from '../core/types'

type HasOneOptions<A extends string = string> = {
  /** The alias for the related row (used in the method name: find{Alias}For). */
  alias: A
  /** Which columns to select from the related table. If omitted, uses all selectable columns. */
  select?: string[]
}

/**
 * Generate a "has one" query for a related table.
 *
 * @param relatedTableDef - The TableDef of the related entity
 * @param foreignKey - The column on the related table referencing the parent entity's PK
 * @param options - Alias and optional column selection
 * @returns A custom query function to spread into queries
 */
export const hasOne = <A extends string>(
  relatedTableDef: TableDef,
  foreignKey: string,
  options: HasOneOptions<A>
): { [K in `find${Capitalize<A>}For`]: (ctx: any) => (id: string | number, opts?: any) => Promise<any | null> } => {
  const { alias, select: selectFields } = options
  const relatedTable = relatedTableDef
  const meta = relatedTableDef.storium

  // Capitalize first letter for method name: 'profile' → 'findProfileFor'
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
     * Find the single related row for a given parent entity ID, or null if not found.
     * Supports where callback opts.
     */
    [methodName]: (_ctx: any) => async (id: string | number, opts?: any) => {
      const selectObj = buildSelectObj()

      const conditions = [eq(relatedTable[foreignKey], id)]
      if (opts?.where) conditions.push(opts.where(relatedTable))
      const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions)

      const rows = await _ctx.drizzle
        .select(selectObj)
        .from(relatedTable)
        .where(whereClause)
        .limit(1)

      return rows[0] ?? null
    },
  } as { [K in `find${Capitalize<A>}For`]: (ctx: any) => (id: string | number, opts?: any) => Promise<any | null> }
}
