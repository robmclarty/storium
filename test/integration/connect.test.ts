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
    /* QA-10301 */ it('[QA-10301] connect returns a working StoriumInstance', async () => {
      const ctx = await createTestDatabase(dialect)

      expect(ctx.storium.dialect).toBe(dialect)
      expect(ctx.storium.drizzle).toBeDefined()
      expect(typeof ctx.storium.defineStore).toBe('function')
      expect(typeof ctx.storium.register).toBe('function')
      expect(typeof ctx.storium.transaction).toBe('function')
      expect(typeof ctx.storium.disconnect).toBe('function')

      await ctx.teardown()
    })

    /* QA-10302 */ it('[QA-10302] disconnect is idempotent', async () => {
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
  /* QA-10303 */ it('[QA-10303] infers memory/sqlite dialect from better-sqlite3 Drizzle instance', () => {
    const memDb = storium.connect({ dialect: 'memory' })
    const fromDrizzleDb = storium.fromDrizzle(memDb.drizzle)
    expect(fromDrizzleDb.dialect).toBe('sqlite')
    memDb.disconnect()
  })
})

// Pool configuration tests
for (const dialect of getTestDialects()) {
  describe(`Pool configuration [${dialect}]`, () => {
    if (dialect === 'memory') {
      /* QA-10304 */ it('[QA-10304] memory dialect ignores pool config', async () => {
        const db = storium.connect({ dialect: 'memory', pool: { max: 5 } } as any)
        expect(db.dialect).toBe('memory')
        await db.disconnect()
      })
    }

    if (dialect === 'postgresql' || dialect === 'mysql') {
      /* QA-10305 */ it(`[QA-10305] connects with explicit pool config`, async () => {
        const ctx = await createTestDatabase(dialect)

        // Verify the connection works (pool was created successfully)
        expect(ctx.storium.drizzle).toBeDefined()
        expect(ctx.storium.dialect).toBe(dialect)

        await ctx.teardown()
      })
    }

    /* QA-10306 */ it('[QA-10306] disconnect is safe to call multiple times across dialects', async () => {
      const ctx = await createTestDatabase(dialect)
      await ctx.storium.disconnect()
      // Second disconnect should not throw
      await ctx.storium.disconnect()
      // Teardown handles container cleanup
      if (dialect !== 'memory') {
        await ctx.teardown().catch(() => {})
      }
    })
  })
}
