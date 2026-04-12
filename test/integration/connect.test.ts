/**
 * Connection lifecycle tests across dialects.
 *
 * Verifies connect, disconnect, and fromDrizzle behavior for each dialect.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { storium } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'

for (const dialect of getTestDialects()) {
  describe(`Connection lifecycle [${dialect}]`, () => {
    it('connect returns a working StoriumInstance', async () => {
      const ctx = await createTestDatabase(dialect)

      expect(ctx.storium.dialect).toBe(dialect)
      expect(ctx.storium.drizzle).toBeDefined()
      expect(typeof ctx.storium.defineStore).toBe('function')
      expect(typeof ctx.storium.register).toBe('function')
      expect(typeof ctx.storium.transaction).toBe('function')
      expect(typeof ctx.storium.disconnect).toBe('function')

      await ctx.teardown()
    })

    it('disconnect is idempotent', async () => {
      const ctx = await createTestDatabase(dialect)

      await ctx.storium.disconnect()
      // Second call should not throw
      await ctx.storium.disconnect()

      // Clean up container if applicable
      if (dialect !== 'memory') {
        // Container already stopped via teardown pattern; just verify no throw
        await ctx.teardown().catch(() => {})
      }
    })
  })
}

// fromDrizzle tests (only run for dialects that support it)
describe('fromDrizzle dialect inference', () => {
  it('infers memory/sqlite dialect from better-sqlite3 Drizzle instance', () => {
    const memDb = storium.connect({ dialect: 'memory' })
    const fromDrizzleDb = storium.fromDrizzle(memDb.drizzle)
    expect(fromDrizzleDb.dialect).toBe('sqlite')
    memDb.disconnect()
  })
})
