/**
 * Concurrency smoke tests across dialects.
 *
 * Verifies that the connection pool handles parallel operations without
 * exhaustion or deadlocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Concurrency [${dialect}]`, () => {
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

      users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    it('10 parallel creates all succeed', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        users.create({ email: `conc_create_${i}@test.com`, name: `Conc${i}` })
      )

      const results = await Promise.all(promises)
      expect(results).toHaveLength(10)
      expect(new Set(results.map((r: any) => r.id)).size).toBe(10) // All unique IDs
    })

    it('parallel reads during writes do not error', async () => {
      // Start some writes
      const writes = Array.from({ length: 5 }, (_, i) =>
        users.create({ email: `conc_rw_${i}@test.com`, name: 'ConcRW' })
      )

      // Start some reads concurrently
      const reads = Array.from({ length: 5 }, () =>
        users.findAll()
      )

      const [writeResults, readResults] = await Promise.all([
        Promise.all(writes),
        Promise.all(reads),
      ])

      expect(writeResults).toHaveLength(5)
      expect(readResults).toHaveLength(5)
      // All reads should return arrays (even if empty)
      readResults.forEach((r: any) => expect(Array.isArray(r)).toBe(true))
    })

    // SQLite uses a single synchronous connection — can't run concurrent transactions
    it.skipIf(dialect === 'memory' || dialect === 'sqlite')('concurrent transactions maintain isolation', async () => {
      // Create a shared user
      const user = await users.create({ email: 'conc_iso@test.com', name: 'Original' })

      // Run two transactions that each update the user's name
      const tx1 = ctx.storium.transaction(async (tx: any) => {
        await users.update(user.id, { name: 'FromTx1' }, { tx })
        return users.findById(user.id, { tx })
      })

      const tx2 = ctx.storium.transaction(async (tx: any) => {
        await users.update(user.id, { name: 'FromTx2' }, { tx })
        return users.findById(user.id, { tx })
      })

      const [r1, r2] = await Promise.all([tx1, tx2])

      // Each transaction should see its own update
      expect(r1.name).toBe('FromTx1')
      expect(r2.name).toBe('FromTx2')

      // Final state should be one of the two (last writer wins)
      const final = await users.findById(user.id)
      expect(['FromTx1', 'FromTx2']).toContain(final.name)
    })
  })
}
