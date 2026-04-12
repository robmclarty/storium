/**
 * @module withMembers
 *
 * Composable membership operations for collection-pattern repositories.
 * Generates standard add/remove/get/check/count operations for any entity
 * that uses a join table with a foreign key and a member ID column.
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

import { eq, and, sql, count } from 'drizzle-orm'
import type { TableDef } from '../types'
import { StoreError } from '../errors'
import { supportsReturning } from '../store/repository'

/**
 * Generate membership query functions for a collection.
 *
 * @param joinTableDef - The TableDef for the join/membership table
 * @param foreignKey - The column name on the join table that references the collection
 * @param memberKey - The column name on the join table that references the member (default: 'member_id')
 * @returns An object of custom query functions to spread into queries
 */
export const withMembers = (
  joinTableDef: TableDef,
  foreignKey: string,
  memberKey: string = 'member_id'
) => {
  const joinTable = joinTableDef

  return {
    /**
     * Add a member to the collection.
     * @param collectionId - The collection's ID
     * @param memberId - The member's ID
     * @param extra - Additional fields to set on the join record (e.g., { role: 'captain' })
     */
    addMember: (ctx: any) => async (
      collectionId: string | number,
      memberId: string | number,
      extra: Record<string, any> = {},
      opts?: { tx?: any }
    ) => {
      const db = opts?.tx ?? ctx.drizzle
      const values = {
        [foreignKey]: collectionId,
        [memberKey]: memberId,
        ...extra,
      }

      if (supportsReturning(ctx.dialect)) {
        const rows = await db
          .insert(joinTable)
          .values(values)
          .returning()

        return rows[0]
      }

      // MySQL: no RETURNING — insert then select back
      await db.insert(joinTable).values(values)
      const rows = await db
        .select()
        .from(joinTable)
        .where(and(
          eq(joinTable[foreignKey], collectionId),
          eq(joinTable[memberKey], memberId),
        ))
        .limit(1)

      if (!rows[0]) {
        throw new StoreError(
          `addMember(): INSERT into join table succeeded but the follow-up SELECT found no matching row.`
        )
      }

      return rows[0]
    },

    /**
     * Remove a member from the collection.
     * Throws StoreError if no membership row was found.
     */
    removeMember: (ctx: any) => async (
      collectionId: string | number,
      memberId: string | number,
      opts?: { tx?: any }
    ) => {
      const db = opts?.tx ?? ctx.drizzle
      const condition = and(
        eq(joinTable[foreignKey], collectionId),
        eq(joinTable[memberKey], memberId),
      )

      if (supportsReturning(ctx.dialect)) {
        const rows = await db.delete(joinTable).where(condition).returning()
        if (!rows[0]) {
          throw new StoreError(
            `removeMember(): no membership row found for ${foreignKey}=${collectionId}, ${memberKey}=${memberId}.`
          )
        }
        return
      }

      // MySQL: check affected rows
      const result = await db.delete(joinTable).where(condition)
      if ((result.affectedRows ?? 0) === 0) {
        throw new StoreError(
          `removeMember(): no membership row found for ${foreignKey}=${collectionId}, ${memberKey}=${memberId}.`
        )
      }
    },

    /**
     * Get all members of a collection. Returns rows from the join table.
     * For richer results (with member details), use a custom query with JOINs.
     */
    getMembers: (ctx: any) => async (collectionId: string | number, opts?: { tx?: any }) => {
      const db = opts?.tx ?? ctx.drizzle
      return db
        .select()
        .from(joinTable)
        .where(eq(joinTable[foreignKey], collectionId))
    },

    /**
     * Check if a member belongs to a collection.
     */
    isMember: (ctx: any) => async (
      collectionId: string | number,
      memberId: string | number,
      opts?: { tx?: any }
    ): Promise<boolean> => {
      const db = opts?.tx ?? ctx.drizzle
      const rows = await db
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
    getMemberCount: (ctx: any) => async (collectionId: string | number, opts?: { tx?: any }): Promise<number> => {
      const db = opts?.tx ?? ctx.drizzle
      const rows = await db
        .select({ count: count() })
        .from(joinTable)
        .where(eq(joinTable[foreignKey], collectionId))

      return rows[0]?.count ?? 0
    },
  }
}
