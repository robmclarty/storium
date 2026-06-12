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

    /* QA-10365 */ it('[QA-10365] commits on success — row is visible after', async () => {
      await ctx.storium.transaction(async (tx) => {
        await users.create({ email: 'tx_commit@test.com', name: 'Committed' }, { tx })
      })

      const found = await users.findOne({ email: 'tx_commit@test.com' })
      expect(found).not.toBeNull()
      expect(found.name).toBe('Committed')
    })

    /* QA-10366 */ it('[QA-10366] rolls back on thrown error — row is not visible', async () => {
      await expect(
        ctx.storium.transaction(async (tx) => {
          await users.create({ email: 'tx_rollback@test.com', name: 'Rolledback' }, { tx })
          throw new Error('Intentional rollback')
        })
      ).rejects.toThrow('Intentional rollback')

      const found = await users.findOne({ email: 'tx_rollback@test.com' })
      expect(found).toBeNull()
    })

    /* QA-10367 */ it('[QA-10367] rolls back on rejected promise — row is not visible', async () => {
      await expect(
        ctx.storium.transaction(async (tx) => {
          await users.create({ email: 'tx_reject@test.com', name: 'Rejected' }, { tx })
          return Promise.reject(new Error('Rejected'))
        })
      ).rejects.toThrow('Rejected')

      const found = await users.findOne({ email: 'tx_reject@test.com' })
      expect(found).toBeNull()
    })

    /* QA-10368 */ it('[QA-10368] multiple operations within a transaction share state', async () => {
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

    /* QA-10369 */ it('[QA-10369] update within transaction returns correct data (UPDATE+SELECT path)', async () => {
      const user = await users.create({ email: 'tx_update@test.com', name: 'TxBefore' })

      await ctx.storium.transaction(async (tx) => {
        const updated = await users.update(user.id, { name: 'TxAfter' }, { tx })
        // The returned row should reflect the update even on MySQL
        expect(updated.name).toBe('TxAfter')
        expect(updated.email).toBe('tx_update@test.com')
      })

      // Verify it persisted
      const found = await users.findById(user.id)
      expect(found.name).toBe('TxAfter')
    })

    /* QA-10416 */ it('[QA-10416] commits with an explicit isolation level', async () => {
      // On PostgreSQL/MySQL the level is plumbed to Drizzle's transaction config;
      // on memory it's a no-op. Either way the transaction must commit normally.
      await ctx.storium.transaction(
        async (tx) => {
          await users.create({ email: 'tx_iso@test.com', name: 'Isolated' }, { tx })
        },
        { isolationLevel: 'serializable' }
      )

      const found = await users.findOne({ email: 'tx_iso@test.com' })
      expect(found).not.toBeNull()
      expect(found.name).toBe('Isolated')
    })
  })
}
