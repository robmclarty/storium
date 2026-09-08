/**
 * Connection lifecycle tests across dialects.
 *
 * Verifies connect, disconnect, and fromDrizzle behavior for each dialect.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { storium } from 'storium'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
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

// Password-function tests (postgresql only — pg is the only driver with a
// per-connection password hook). This block starts its own container so it can
// read the container's real password and hand it back through the function; it
// is skipped whenever TEST_DIALECTS excludes postgresql (e.g. a memory-only run).
describe.skipIf(!getTestDialects().includes('postgresql'))('password function [postgresql]', () => {
  let container: StartedPostgreSqlContainer

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
  })

  afterAll(async () => {
    await container.stop()
  })

  /* QA-10434 */ it('[QA-10434] pg calls the password function once per new pooled connection', async () => {
    let calls = 0
    const db = storium.connect({
      dialect: 'postgresql',
      host: container.getHost(),
      port: container.getPort(),
      user: container.getUsername(),
      database: container.getDatabase(),
      password: async () => {
        calls++
        return container.getPassword()
      },
      pool: { max: 2 },
    })

    try {
      // Two concurrent queries force the pool to open two connections at once,
      // so the function is resolved once per connection.
      await Promise.all([
        db.drizzle.execute(sql`SELECT 1`),
        db.drizzle.execute(sql`SELECT 1`),
      ])
      expect(calls).toBe(2)

      // A third, sequential query reuses an idle client — no new connection,
      // so the function is not called again.
      await db.drizzle.execute(sql`SELECT 1`)
      expect(calls).toBe(2)
    } finally {
      await db.disconnect().catch(() => {})
    }
  })

  /* QA-10435 */ it('[QA-10435] a wrong password from the function fails auth (28P01) on the first query', async () => {
    const db = storium.connect({
      dialect: 'postgresql',
      host: container.getHost(),
      port: container.getPort(),
      user: container.getUsername(),
      database: container.getDatabase(),
      password: async () => 'definitely-not-the-password',
    })

    try {
      let code: string | undefined
      try {
        await db.drizzle.execute(sql`SELECT 1`)
      } catch (err) {
        // Drizzle wraps the pg error, so the SQLSTATE is on the cause chain.
        const e = err as { code?: string; cause?: { code?: string } }
        code = e.code ?? e.cause?.code
      }
      // pg sent what the function returned; the server rejected it with the
      // invalid_password SQLSTATE, proving the return value reached the wire.
      expect(code).toBe('28P01')
    } finally {
      await db.disconnect().catch(() => {})
    }
  })
})
