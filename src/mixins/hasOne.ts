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
 *
 * @remarks `ctx: any` in the return type is intentional — mixin query
 * factories must compose with arbitrary repository contexts without
 * introducing circular imports between mixins and types.ts.
 */

import type { TableDef } from '../types'
import { buildRelatedSelect, buildRelatedWhere, prepareRelatedMixin } from './hasMany'

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
  const { relatedTable, methodName, columns: relatedColumns } = prepareRelatedMixin(relatedTableDef, options)

  return {
    /**
     * Find the single related row for a given parent entity ID, or null if not found.
     * Supports where callback opts.
     */
    [methodName]: (_ctx: any) => async (id: string | number, opts?: any) => {
      const selectObj = buildRelatedSelect(relatedTable, relatedColumns)
      const whereClause = buildRelatedWhere(relatedTable, foreignKey, id, opts)

      const rows = await _ctx.drizzle
        .select(selectObj)
        .from(relatedTable)
        .where(whereClause)
        .limit(1)

      return rows[0] ?? null
    },
  } as { [K in `find${Capitalize<A>}For`]: (ctx: any) => (id: string | number, opts?: any) => Promise<any | null> }
}
