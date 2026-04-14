/**
 * Upsert integration tests across dialects.
 *
 * Exercises insert-on-miss, update-on-conflict, composite PK upsert,
 * and idempotency — including MySQL's onDuplicateKeyUpdate path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Upsert [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any
    let memberships: any

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

      users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })
      memberships = ctx.storium.defineStore(tables.memberships)
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    /* QA-10370 */ it('[QA-10370] inserts when row does not exist', async () => {
      const row = await users.upsert({ email: 'upsert_new@test.com', name: 'New' })
      expect(row.email).toBe('upsert_new@test.com')
      expect(row.name).toBe('New')
      expect(row.id).toBeDefined()
    })

    /* QA-10371 */ it('[QA-10371] updates when row with same PK exists', async () => {
      const created = await users.create({ email: 'upsert_exist@test.com', name: 'Before' })

      const upserted = await users.upsert({
        id: created.id,
        email: 'upsert_exist@test.com',
        name: 'After',
      })

      expect(upserted.id).toBe(created.id)
      expect(upserted.name).toBe('After')
    })

    /* QA-10372 */ it('[QA-10372] idempotent — same data twice returns same row', async () => {
      const first = await users.upsert({ email: 'upsert_idem@test.com', name: 'Idem' })
      const second = await users.upsert({
        id: first.id,
        email: 'upsert_idem@test.com',
        name: 'Idem',
      })

      expect(second.id).toBe(first.id)
      expect(second.email).toBe(first.email)
      expect(second.name).toBe(first.name)
    })

    /* QA-10373 */ it('[QA-10373] upsert with composite PK table', async () => {
      const uid = crypto.randomUUID()
      const gid = crypto.randomUUID()

      const first = await memberships.upsert(
        { user_id: uid, group_id: gid, role: 'member' },
        { skipPrep: true }
      )
      expect(first.role).toBe('member')

      const updated = await memberships.upsert(
        { user_id: uid, group_id: gid, role: 'admin' },
        { skipPrep: true, conflictTarget: ['user_id', 'group_id'] }
      )
      expect(updated.role).toBe('admin')
    })
  })
}
