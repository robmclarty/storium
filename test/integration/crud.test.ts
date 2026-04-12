/**
 * Multi-dialect CRUD tests.
 *
 * Runs the same test suite against every dialect listed in TEST_DIALECTS.
 * Default: 'memory' only (fast). Set TEST_DIALECTS=memory,postgresql,mysql
 * to run against real databases via testcontainers (requires Docker).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore, StoreError } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`CRUD [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any
    let memberships: any

    beforeAll(async () => {
      ctx = await createTestDatabase(dialect)
      const tables = getTables(dialect)
      const ddl = getDDL(dialect)

      // Create tables
      for (const statement of Object.values(ddl)) {
        if (dialect === 'memory') {
          ctx.storium.drizzle.run(sql.raw(statement))
        } else {
          await ctx.storium.drizzle.execute(sql.raw(statement))
        }
      }

      // Define stores
      users = ctx.storium.defineStore(tables.users, {
        columns: {
          email: { required: true },
          password_hash: { hidden: true },
        },
      })
      memberships = ctx.storium.defineStore(tables.memberships)
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    // -------------------------------------------------------- create --

    it('creates a row and returns it with all visible fields', async () => {
      const user = await users.create({ email: 'alice@test.com', name: 'Alice' })
      expect(user.email).toBe('alice@test.com')
      expect(user.name).toBe('Alice')
      expect(user.id).toBeDefined()
      // Hidden column should not be in result
      expect(user.password_hash).toBeUndefined()
    })

    it('creates with hidden column (not returned by default)', async () => {
      const user = await users.create({
        email: 'hidden@test.com',
        name: 'Hidden',
        password_hash: 'secret123',
      })
      expect(user.password_hash).toBeUndefined()
    })

    // -------------------------------------------------------- findById --

    it('finds a row by ID', async () => {
      const created = await users.create({ email: 'findme@test.com', name: 'FindMe' })
      const found = await users.findById(created.id)
      expect(found).not.toBeNull()
      expect(found.email).toBe('findme@test.com')
    })

    it('returns null for non-existent ID', async () => {
      const found = await users.findById('00000000-0000-0000-0000-000000000000')
      expect(found).toBeNull()
    })

    // -------------------------------------------------------- find --

    it('finds rows by filter', async () => {
      await users.create({ email: 'filter1@test.com', name: 'FilterGroup' })
      await users.create({ email: 'filter2@test.com', name: 'FilterGroup' })
      const results = await users.find({ name: 'FilterGroup' })
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.every((r: any) => r.name === 'FilterGroup')).toBe(true)
    })

    it('respects limit and offset', async () => {
      const all = await users.find({ name: 'FilterGroup' })
      const limited = await users.find({ name: 'FilterGroup' }, { limit: 1 })
      expect(limited).toHaveLength(1)

      const offset = await users.find({ name: 'FilterGroup' }, { limit: 1, offset: 1 })
      expect(offset).toHaveLength(1)
      expect(offset[0].id).not.toBe(limited[0].id)
    })

    // -------------------------------------------------------- findOne --

    it('findOne returns a single row', async () => {
      await users.create({ email: 'unique_one@test.com', name: 'Unique' })
      const found = await users.findOne({ email: 'unique_one@test.com' })
      expect(found).not.toBeNull()
      expect(found.email).toBe('unique_one@test.com')
    })

    it('findOne returns null when no match', async () => {
      const found = await users.findOne({ email: 'nonexistent_xyz@test.com' })
      expect(found).toBeNull()
    })

    // -------------------------------------------------------- update --

    it('updates a row and returns the result', async () => {
      const created = await users.create({ email: 'update_me@test.com', name: 'Before' })
      const updated = await users.update(created.id, { name: 'After' })
      expect(updated.name).toBe('After')
      expect(updated.email).toBe('update_me@test.com')
    })

    it('update throws StoreError for non-existent row', async () => {
      await expect(
        users.update('00000000-0000-0000-0000-000000000000', { name: 'X' })
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- destroy --

    it('destroys an existing row', async () => {
      const created = await users.create({ email: 'delete_me@test.com', name: 'DeleteMe' })
      await users.destroy(created.id)
      const found = await users.findById(created.id)
      expect(found).toBeNull()
    })

    it('destroy throws StoreError for non-existent row', async () => {
      await expect(
        users.destroy('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- createMany --

    it('creates multiple rows and returns them', async () => {
      const rows = await users.createMany([
        { email: 'many1@test.com', name: 'Many1' },
        { email: 'many2@test.com', name: 'Many2' },
      ])
      expect(rows).toHaveLength(2)
      expect(rows.map((r: any) => r.email).sort()).toEqual(['many1@test.com', 'many2@test.com'])
    })

    // -------------------------------------------------------- upsert --

    it('upsert inserts when no conflict', async () => {
      const row = await users.upsert({ email: 'upsert_new@test.com', name: 'UpsertNew' })
      expect(row.email).toBe('upsert_new@test.com')
    })

    // -------------------------------------------------------- count --

    it('counts rows with and without filters', async () => {
      const total = await users.count()
      expect(total).toBeGreaterThan(0)

      const filtered = await users.count({ name: 'FilterGroup' })
      expect(filtered).toBeGreaterThanOrEqual(2)
    })

    // -------------------------------------------------------- exists --

    it('exists returns true for matching rows', async () => {
      await users.create({ email: 'exists_check@test.com', name: 'ExistsCheck' })
      const result = await users.exists({ email: 'exists_check@test.com' })
      expect(result).toBe(true)
    })

    it('exists returns false for non-matching rows', async () => {
      const result = await users.exists({ email: 'does_not_exist_xyz@test.com' })
      expect(result).toBe(false)
    })

    // -------------------------------------------------------- ref --

    it('ref returns the primary key of a matching row', async () => {
      const created = await users.create({ email: 'ref_test@test.com', name: 'RefTest' })
      const pk = await users.ref({ email: 'ref_test@test.com' })
      expect(pk).toBe(created.id)
    })

    it('ref throws StoreError for no match', async () => {
      await expect(
        users.ref({ email: 'ref_missing_xyz@test.com' })
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- findByIdIn --

    it('findByIdIn returns rows for given IDs', async () => {
      const a = await users.create({ email: 'idin_a@test.com', name: 'A' })
      const b = await users.create({ email: 'idin_b@test.com', name: 'B' })
      const results = await users.findByIdIn([a.id, b.id])
      expect(results).toHaveLength(2)
    })

    it('findByIdIn returns empty array for empty input', async () => {
      const results = await users.findByIdIn([])
      expect(results).toEqual([])
    })

    // ------------------------------------------------ destroyAll --

    it('destroyAll removes matching rows', async () => {
      await users.create({ email: 'da1@test.com', name: 'DestroyAllGroup' })
      await users.create({ email: 'da2@test.com', name: 'DestroyAllGroup' })
      const count = await users.destroyAll({ name: 'DestroyAllGroup' })
      expect(count).toBeGreaterThanOrEqual(2)
    })

    // -------------------------------------------- filter validation --

    it('throws StoreError for unknown filter keys', async () => {
      await expect(
        users.find({ nonExistentColumn: 'value' })
      ).rejects.toThrow(StoreError)
    })

    // ------------------------------------------- composite PK --

    it('creates and finds with composite primary key', async () => {
      await memberships.create(
        { user_id: 'u1', group_id: 'g1', role: 'admin' },
        { skipPrep: true }
      )
      const found = await memberships.findById(['u1', 'g1'])
      expect(found).not.toBeNull()
      expect(found.role).toBe('admin')
    })
  })
}
