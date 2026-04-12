/**
 * Soft delete integration tests across dialects.
 *
 * Exercises soft delete, restore, forceDestroy, findWithDeleted,
 * and countWithDeleted behavior — including MySQL's affectedRows path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Soft delete [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any

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

      users = ctx.storium.defineStore(tables.softDeleteUsers, {
        columns: { email: { required: true } },
        softDelete: true,
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    // ------------------------------------------------ destroy (soft) --

    it('destroy sets deletedAt and excludes row from find', async () => {
      const user = await users.create({ email: 'soft1@test.com', name: 'Soft1' })
      await users.destroy(user.id)

      const found = await users.findById(user.id)
      expect(found).toBeNull()
    })

    it('destroy excludes row from findAll', async () => {
      const user = await users.create({ email: 'soft2@test.com', name: 'SoftAll' })
      await users.destroy(user.id)

      const all = await users.findAll()
      const ids = all.map((r: any) => r.id)
      expect(ids).not.toContain(user.id)
    })

    it('destroy excludes row from find with filters', async () => {
      const user = await users.create({ email: 'soft3@test.com', name: 'SoftFind' })
      await users.destroy(user.id)

      const results = await users.find({ name: 'SoftFind' })
      expect(results).toHaveLength(0)
    })

    // ------------------------------------------------ restore --

    it('restore clears deletedAt and makes row visible again', async () => {
      const user = await users.create({ email: 'restore1@test.com', name: 'Restore1' })
      await users.destroy(user.id)

      // Confirm it's gone
      expect(await users.findById(user.id)).toBeNull()

      // Restore
      const restored = await users.restore(user.id)
      expect(restored).not.toBeNull()
      expect(restored.email).toBe('restore1@test.com')
      expect(restored.deletedAt).toBeNull()

      // Confirm it's visible again
      const found = await users.findById(user.id)
      expect(found).not.toBeNull()
    })

    // ------------------------------------------------ forceDestroy --

    it('forceDestroy permanently removes the row', async () => {
      const user = await users.create({ email: 'force1@test.com', name: 'Force1' })
      await users.forceDestroy(user.id)

      // Not visible in normal find
      expect(await users.findById(user.id)).toBeNull()

      // Not visible even with findWithDeleted
      const withDeleted = await users.findWithDeleted({ email: 'force1@test.com' })
      expect(withDeleted).toHaveLength(0)
    })

    // ------------------------------------------------ destroyAll (soft) --

    it('destroyAll soft-deletes matching rows and returns count', async () => {
      await users.create({ email: 'da1@test.com', name: 'SoftDestroyAll' })
      await users.create({ email: 'da2@test.com', name: 'SoftDestroyAll' })

      const count = await users.destroyAll({ name: 'SoftDestroyAll' })
      expect(count).toBeGreaterThanOrEqual(2)

      // Soft-deleted — not visible
      const results = await users.find({ name: 'SoftDestroyAll' })
      expect(results).toHaveLength(0)

      // But still in DB
      const withDeleted = await users.findWithDeleted({ name: 'SoftDestroyAll' })
      expect(withDeleted.length).toBeGreaterThanOrEqual(2)
    })

    // ------------------------------------------------ count --

    it('count excludes soft-deleted rows', async () => {
      const user = await users.create({ email: 'count1@test.com', name: 'CountSD' })
      const beforeCount = await users.count({ name: 'CountSD' })
      expect(beforeCount).toBe(1)

      await users.destroy(user.id)

      const afterCount = await users.count({ name: 'CountSD' })
      expect(afterCount).toBe(0)
    })

    it('countWithDeleted includes soft-deleted rows', async () => {
      const user = await users.create({ email: 'countwd@test.com', name: 'CountWD' })
      await users.destroy(user.id)

      const withDeleted = await users.countWithDeleted({ name: 'CountWD' })
      expect(withDeleted).toBe(1)

      const without = await users.count({ name: 'CountWD' })
      expect(without).toBe(0)
    })

    // ------------------------------------------------ findWithDeleted --

    it('findWithDeleted returns both active and soft-deleted rows', async () => {
      const active = await users.create({ email: 'fwd_active@test.com', name: 'FWDGroup' })
      const deleted = await users.create({ email: 'fwd_deleted@test.com', name: 'FWDGroup' })
      await users.destroy(deleted.id)

      const results = await users.findWithDeleted({ name: 'FWDGroup' })
      const ids = results.map((r: any) => r.id)
      expect(ids).toContain(active.id)
      expect(ids).toContain(deleted.id)
    })

    // ---------------------------------------- deletedAt round-trip --

    it('deletedAt timestamp round-trips correctly', async () => {
      const user = await users.create({ email: 'ts_rt@test.com', name: 'TimestampRT' })
      await users.destroy(user.id)

      const [row] = await users.findWithDeleted({ email: 'ts_rt@test.com' })
      expect(row.deletedAt).toBeDefined()
      expect(row.deletedAt).not.toBeNull()

      // Should be parseable as a date (string or Date depending on dialect)
      const ts = new Date(row.deletedAt)
      expect(ts.getTime()).toBeGreaterThan(0)
    })
  })
}
