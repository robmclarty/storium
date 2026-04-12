/**
 * withMembers mixin integration tests across dialects.
 *
 * Exercises addMember, removeMember, getMembers, isMember, getMemberCount
 * — including MySQL's INSERT + SELECT fallback path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore, withMembers } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`withMembers [${dialect}]`, () => {
    let ctx: TestDatabase
    let teams: any

    beforeAll(async () => {
      ctx = await createTestDatabase(dialect)
      const tables = getTables(dialect)
      const ddl = getDDL(dialect)

      for (const statement of Object.values(ddl)) {
        if (dialect === 'memory') {
          ctx.storium.drizzle.run(sql.raw(statement))
        } else {
          await ctx.storium.drizzle.execute(sql.raw(statement))
        }
      }

      // Define a store for team_members with withMembers mixin
      // We need a "teams" store that uses the team_members join table
      const teamMembersStore = ctx.storium.defineStore(tables.teamMembers)

      // Create a minimal "teams" store and add withMembers queries
      // withMembers expects a table with .storium metadata
      teams = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      }).queries({
        ...withMembers(tables.teamMembers, 'team_id'),
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    it('addMember inserts and returns the membership row', async () => {
      const team = await teams.create({ email: 'team1@test.com', name: 'Team1' })
      const memberId = crypto.randomUUID()

      const membership = await teams.addMember(team.id, memberId, { role: 'captain' })
      expect(membership).toBeDefined()
      expect(membership.team_id).toBe(team.id)
      expect(membership.member_id).toBe(memberId)
      expect(membership.role).toBe('captain')
    })

    it('getMembers returns all members for a collection', async () => {
      const team = await teams.create({ email: 'team2@test.com', name: 'Team2' })
      const m1 = crypto.randomUUID()
      const m2 = crypto.randomUUID()

      await teams.addMember(team.id, m1, { role: 'member' })
      await teams.addMember(team.id, m2, { role: 'admin' })

      const members = await teams.getMembers(team.id)
      expect(members).toHaveLength(2)
      const memberIds = members.map((m: any) => m.member_id).toSorted()
      expect(memberIds).toEqual([m1, m2].toSorted())
    })

    it('isMember returns true/false correctly', async () => {
      const team = await teams.create({ email: 'team3@test.com', name: 'Team3' })
      const memberId = crypto.randomUUID()
      const nonMemberId = crypto.randomUUID()

      await teams.addMember(team.id, memberId)

      expect(await teams.isMember(team.id, memberId)).toBe(true)
      expect(await teams.isMember(team.id, nonMemberId)).toBe(false)
    })

    it('getMemberCount returns correct count', async () => {
      const team = await teams.create({ email: 'team4@test.com', name: 'Team4' })

      expect(await teams.getMemberCount(team.id)).toBe(0)

      await teams.addMember(team.id, crypto.randomUUID())
      await teams.addMember(team.id, crypto.randomUUID())
      await teams.addMember(team.id, crypto.randomUUID())

      expect(await teams.getMemberCount(team.id)).toBe(3)
    })

    it('removeMember deletes the membership', async () => {
      const team = await teams.create({ email: 'team5@test.com', name: 'Team5' })
      const memberId = crypto.randomUUID()

      await teams.addMember(team.id, memberId)
      expect(await teams.isMember(team.id, memberId)).toBe(true)

      await teams.removeMember(team.id, memberId)
      expect(await teams.isMember(team.id, memberId)).toBe(false)
    })
  })
}
