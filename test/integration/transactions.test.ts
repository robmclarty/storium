/**
 * Transaction tests across dialects.
 *
 * Verifies commit/rollback behavior for each supported dialect.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Transactions [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any

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

      users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    it('commits on success — row is visible after', async () => {
      await ctx.storium.transaction(async (tx) => {
        await users.create({ email: 'tx_commit@test.com', name: 'Committed' }, { tx })
      })

      const found = await users.findOne({ email: 'tx_commit@test.com' })
      expect(found).not.toBeNull()
      expect(found.name).toBe('Committed')
    })

    it('rolls back on thrown error — row is not visible', async () => {
      await expect(
        ctx.storium.transaction(async (tx) => {
          await users.create({ email: 'tx_rollback@test.com', name: 'Rolledback' }, { tx })
          throw new Error('Intentional rollback')
        })
      ).rejects.toThrow('Intentional rollback')

      const found = await users.findOne({ email: 'tx_rollback@test.com' })
      expect(found).toBeNull()
    })

    it('rolls back on rejected promise — row is not visible', async () => {
      await expect(
        ctx.storium.transaction(async (tx) => {
          await users.create({ email: 'tx_reject@test.com', name: 'Rejected' }, { tx })
          return Promise.reject(new Error('Rejected'))
        })
      ).rejects.toThrow('Rejected')

      const found = await users.findOne({ email: 'tx_reject@test.com' })
      expect(found).toBeNull()
    })

    it('multiple operations within a transaction share state', async () => {
      await ctx.storium.transaction(async (tx) => {
        const user = await users.create(
          { email: 'tx_multi@test.com', name: 'Before' },
          { tx }
        )
        await users.update(user.id, { name: 'After' }, { tx })
      })

      const found = await users.findOne({ email: 'tx_multi@test.com' })
      expect(found).not.toBeNull()
      expect(found.name).toBe('After')
    })
  })
}
