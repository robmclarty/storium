/**
 * Multi-dialect CRUD tests.
 *
 * Runs the same test suite against every dialect listed in TEST_DIALECTS.
 * Default: 'memory' only (fast). Set TEST_DIALECTS=memory,postgresql,mysql
 * to run against real databases via testcontainers (requires Docker).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, and, or, gt, like } from 'drizzle-orm'
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

    /* QA-10307 */ it('[QA-10307] creates a row and returns it with all visible fields', async () => {
      const user = await users.create({ email: 'alice@test.com', name: 'Alice' })
      expect(user.email).toBe('alice@test.com')
      expect(user.name).toBe('Alice')
      expect(user.id).toBeDefined()
      // Hidden column should not be in result
      expect(user.password_hash).toBeUndefined()
    })

    /* QA-10308 */ it('[QA-10308] creates with hidden column (not returned by default)', async () => {
      const user = await users.create({
        email: 'hidden@test.com',
        name: 'Hidden',
        password_hash: 'secret123',
      })
      expect(user.password_hash).toBeUndefined()
    })

    // -------------------------------------------------------- findById --

    /* QA-10309 */ it('[QA-10309] finds a row by ID', async () => {
      const created = await users.create({ email: 'findme@test.com', name: 'FindMe' })
      const found = await users.findById(created.id)
      expect(found).not.toBeNull()
      expect(found.email).toBe('findme@test.com')
    })

    /* QA-10310 */ it('[QA-10310] returns null for non-existent ID', async () => {
      const found = await users.findById('00000000-0000-0000-0000-000000000000')
      expect(found).toBeNull()
    })

    // -------------------------------------------------------- find --

    /* QA-10311 */ it('[QA-10311] finds rows by filter', async () => {
      await users.create({ email: 'filter1@test.com', name: 'FilterGroup' })
      await users.create({ email: 'filter2@test.com', name: 'FilterGroup' })
      const results = await users.find({ name: 'FilterGroup' })
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.every((r: any) => r.name === 'FilterGroup')).toBe(true)
    })

    /* QA-10312 */ it('[QA-10312] respects limit and offset', async () => {
      const all = await users.find({ name: 'FilterGroup' })
      const limited = await users.find({ name: 'FilterGroup' }, { limit: 1 })
      expect(limited).toHaveLength(1)

      const offset = await users.find({ name: 'FilterGroup' }, { limit: 1, offset: 1 })
      expect(offset).toHaveLength(1)
      expect(offset[0].id).not.toBe(limited[0].id)
    })

    // -------------------------------------------------------- findOne --

    /* QA-10313 */ it('[QA-10313] findOne returns a single row', async () => {
      await users.create({ email: 'unique_one@test.com', name: 'Unique' })
      const found = await users.findOne({ email: 'unique_one@test.com' })
      expect(found).not.toBeNull()
      expect(found.email).toBe('unique_one@test.com')
    })

    /* QA-10314 */ it('[QA-10314] findOne returns null when no match', async () => {
      const found = await users.findOne({ email: 'nonexistent_xyz@test.com' })
      expect(found).toBeNull()
    })

    // -------------------------------------------------------- update --

    /* QA-10315 */ it('[QA-10315] updates a row and returns the result', async () => {
      const created = await users.create({ email: 'update_me@test.com', name: 'Before' })
      const updated = await users.update(created.id, { name: 'After' })
      expect(updated.name).toBe('After')
      expect(updated.email).toBe('update_me@test.com')
    })

    /* QA-10316 */ it('[QA-10316] update throws StoreError for non-existent row', async () => {
      await expect(
        users.update('00000000-0000-0000-0000-000000000000', { name: 'X' })
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- destroy --

    /* QA-10317 */ it('[QA-10317] destroys an existing row', async () => {
      const created = await users.create({ email: 'delete_me@test.com', name: 'DeleteMe' })
      await users.destroy(created.id)
      const found = await users.findById(created.id)
      expect(found).toBeNull()
    })

    /* QA-10318 */ it('[QA-10318] destroy throws StoreError for non-existent row', async () => {
      await expect(
        users.destroy('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- createMany --

    /* QA-10319 */ it('[QA-10319] creates multiple rows and returns them', async () => {
      const rows = await users.createMany([
        { email: 'many1@test.com', name: 'Many1' },
        { email: 'many2@test.com', name: 'Many2' },
      ])
      expect(rows).toHaveLength(2)
      expect(rows.map((r: any) => r.email).toSorted()).toEqual(['many1@test.com', 'many2@test.com'])
    })

    // -------------------------------------------------------- upsert --

    /* QA-10320 */ it('[QA-10320] upsert inserts when no conflict', async () => {
      const row = await users.upsert({ email: 'upsert_new@test.com', name: 'UpsertNew' })
      expect(row.email).toBe('upsert_new@test.com')
    })

    // -------------------------------------------------------- count --

    /* QA-10321 */ it('[QA-10321] counts rows with and without filters', async () => {
      const total = await users.count()
      expect(total).toBeGreaterThan(0)

      const filtered = await users.count({ name: 'FilterGroup' })
      expect(filtered).toBeGreaterThanOrEqual(2)
    })

    // -------------------------------------------------------- exists --

    /* QA-10322 */ it('[QA-10322] exists returns true for matching rows', async () => {
      await users.create({ email: 'exists_check@test.com', name: 'ExistsCheck' })
      const result = await users.exists({ email: 'exists_check@test.com' })
      expect(result).toBe(true)
    })

    /* QA-10323 */ it('[QA-10323] exists returns false for non-matching rows', async () => {
      const result = await users.exists({ email: 'does_not_exist_xyz@test.com' })
      expect(result).toBe(false)
    })

    // -------------------------------------------------------- ref --

    /* QA-10324 */ it('[QA-10324] ref returns the primary key of a matching row', async () => {
      const created = await users.create({ email: 'ref_test@test.com', name: 'RefTest' })
      const pk = await users.ref({ email: 'ref_test@test.com' })
      expect(pk).toBe(created.id)
    })

    /* QA-10325 */ it('[QA-10325] ref throws StoreError for no match', async () => {
      await expect(
        users.ref({ email: 'ref_missing_xyz@test.com' })
      ).rejects.toThrow(StoreError)
    })

    // -------------------------------------------------------- findByIdIn --

    /* QA-10326 */ it('[QA-10326] findByIdIn returns rows for given IDs', async () => {
      const a = await users.create({ email: 'idin_a@test.com', name: 'A' })
      const b = await users.create({ email: 'idin_b@test.com', name: 'B' })
      const results = await users.findByIdIn([a.id, b.id])
      expect(results).toHaveLength(2)
    })

    /* QA-10327 */ it('[QA-10327] findByIdIn returns empty array for empty input', async () => {
      const results = await users.findByIdIn([])
      expect(results).toEqual([])
    })

    // ------------------------------------------------ destroyAll --

    /* QA-10328 */ it('[QA-10328] destroyAll removes matching rows', async () => {
      await users.create({ email: 'da1@test.com', name: 'DestroyAllGroup' })
      await users.create({ email: 'da2@test.com', name: 'DestroyAllGroup' })
      const count = await users.destroyAll({ name: 'DestroyAllGroup' })
      expect(count).toBeGreaterThanOrEqual(2)
    })

    // -------------------------------------------- filter validation --

    /* QA-10329 */ it('[QA-10329] throws StoreError for unknown filter keys', async () => {
      await expect(
        users.find({ nonExistentColumn: 'value' })
      ).rejects.toThrow(StoreError)
    })

    // ------------------------------------------- composite PK --

    /* QA-10330 */ it('[QA-10330] creates and finds with composite primary key', async () => {
      const uid = crypto.randomUUID()
      const gid = crypto.randomUUID()
      await memberships.create(
        { user_id: uid, group_id: gid, role: 'admin' },
        { skipPrep: true }
      )
      const found = await memberships.findById([uid, gid])
      expect(found).not.toBeNull()
      expect(found.role).toBe('admin')
    })

    // -------------------------------- createMany with composite PK --

    /* QA-10331 */ it('[QA-10331] createMany with composite PK returns all rows', async () => {
      const gid = crypto.randomUUID()
      const rows = await memberships.createMany([
        { user_id: crypto.randomUUID(), group_id: gid, role: 'admin' },
        { user_id: crypto.randomUUID(), group_id: gid, role: 'member' },
        { user_id: crypto.randomUUID(), group_id: gid, role: 'viewer' },
      ], { skipPrep: true })

      expect(rows).toHaveLength(3)
      const roles = rows.map((r: any) => r.role).toSorted()
      expect(roles).toEqual(['admin', 'member', 'viewer'])
    })

    // ---------------------------------------- complex WHERE clauses --

    /* QA-10332 */ it('[QA-10332] find with where callback using and()', async () => {
      await users.create({ email: 'where_and@test.com', name: 'WhereAnd' })

      const results = await users.find(
        { name: 'WhereAnd' },
        { where: (t: any) => like(t.email, '%where_and%') }
      )
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].name).toBe('WhereAnd')
    })

    /* QA-10333 */ it('[QA-10333] find with where callback using or()', async () => {
      await users.create({ email: 'where_or1@test.com', name: 'WhereOr1' })
      await users.create({ email: 'where_or2@test.com', name: 'WhereOr2' })

      const results = await users.findAll({
        where: (t: any) => or(
          like(t.name, 'WhereOr1'),
          like(t.name, 'WhereOr2'),
        ),
      })
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    /* QA-10334 */ it('[QA-10334] findByIdIn with many IDs', async () => {
      const ids: string[] = []
      for (let i = 0; i < 20; i++) {
        const user = await users.create({ email: `bulkid_${i}@test.com`, name: 'BulkId' })
        ids.push(user.id)
      }

      const results = await users.findByIdIn(ids)
      expect(results).toHaveLength(20)
    })

    /* QA-10335 */ it('[QA-10335] find with multiple equality filters', async () => {
      await users.create({ email: 'multi_eq@test.com', name: 'MultiEq' })

      const results = await users.find({ email: 'multi_eq@test.com', name: 'MultiEq' })
      expect(results).toHaveLength(1)
      expect(results[0].email).toBe('multi_eq@test.com')
    })
  })
}
