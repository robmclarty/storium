/**
 * Storium v1 — withMembers
 *
 * Composable membership operations for collection-pattern repositories.
 * Generates standard add/remove/get/check/count operations for any entity
 * that uses a join table with a foreign key and a `user_id` column.
 *
 * Spread into a defineStore's `queries` or createRepository's custom queries.
 *
 * @example
 * const teams = db.defineStore('teams', columns, {
 *   queries: {
 *     ...withMembers(teamMembers, 'team_id'),
 *   },
 * })
 *
 * await teams.addMember(teamId, userId, { role: 'captain' })
 * await teams.getMembers(teamId)
 * await teams.isMember(teamId, userId)
 * await teams.removeMember(teamId, userId)
 * await teams.getMemberCount(teamId)
 */

import { eq, and, sql } from 'drizzle-orm'
import type { TableDef, CustomQueryFn } from '../core/types'

/**
 * Generate membership query functions for a collection.
 *
 * @param joinTableDef - The TableDef for the join/membership table
 * @param foreignKey - The column name on the join table that references the collection
 * @param memberKey - The column name on the join table that references the member (default: 'user_id')
 * @returns An object of custom query functions to spread into queries
 */
export const withMembers = (
  joinTableDef: TableDef,
  foreignKey: string,
  memberKey: string = 'user_id'
): Record<string, CustomQueryFn> => {
  const joinTable = joinTableDef.table

  return {
    /**
     * Add a member to the collection.
     * @param collectionId - The collection's ID
     * @param memberId - The member's ID
     * @param extra - Additional fields to set on the join record (e.g., { role: 'captain' })
     */
    addMember: (ctx) => async (
      collectionId: string | number,
      memberId: string | number,
      extra: Record<string, any> = {}
    ) => {
      const values = {
        [foreignKey]: collectionId,
        [memberKey]: memberId,
        ...extra,
      }

      if (ctx.drizzle.$dialect === 'postgresql') {
        const rows = await ctx.drizzle
          .insert(joinTable)
          .values(values)
          .returning()

        return rows[0]
      }

      await ctx.drizzle.insert(joinTable).values(values)
      const rows = await ctx.drizzle
        .select()
        .from(joinTable)
        .where(and(
          eq(joinTable[foreignKey], collectionId),
          eq(joinTable[memberKey], memberId),
        ))
        .limit(1)

      return rows[0]
    },

    /**
     * Remove a member from the collection.
     */
    removeMember: (ctx) => async (
      collectionId: string | number,
      memberId: string | number
    ) => {
      await ctx.drizzle
        .delete(joinTable)
        .where(and(
          eq(joinTable[foreignKey], collectionId),
          eq(joinTable[memberKey], memberId),
        ))
    },

    /**
     * Get all members of a collection. Returns rows from the join table.
     * For richer results (with member details), use a custom query with JOINs.
     */
    getMembers: (ctx) => async (collectionId: string | number) => {
      return ctx.drizzle
        .select()
        .from(joinTable)
        .where(eq(joinTable[foreignKey], collectionId))
    },

    /**
     * Check if a member belongs to a collection.
     */
    isMember: (ctx) => async (
      collectionId: string | number,
      memberId: string | number
    ): Promise<boolean> => {
      const rows = await ctx.drizzle
        .select({ exists: sql<number>`1` })
        .from(joinTable)
        .where(and(
          eq(joinTable[foreignKey], collectionId),
          eq(joinTable[memberKey], memberId),
        ))
        .limit(1)

      return rows.length > 0
    },

    /**
     * Count the members in a collection.
     */
    getMemberCount: (ctx) => async (collectionId: string | number): Promise<number> => {
      const rows = await ctx.drizzle
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(joinTable)
        .where(eq(joinTable[foreignKey], collectionId))

      return rows[0]?.count ?? 0
    },
  }
}
