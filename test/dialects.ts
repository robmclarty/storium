/**
 * Dialect-aware test database factory.
 *
 * Creates a StoriumInstance for any supported dialect:
 * - 'memory': In-memory SQLite (fast, no dependencies)
 * - 'postgresql': Testcontainers PostgreSQL 16
 * - 'mysql': Testcontainers MySQL 8
 *
 * Usage:
 *   const ctx = await createTestDatabase('postgresql')
 *   // ... run tests with ctx.storium ...
 *   await ctx.teardown()
 */

import { storium } from 'storium'
import type { Dialect, StoriumInstance } from 'storium'

export type TestDatabase = {
  storium: StoriumInstance<any>
  dialect: Dialect
  teardown: () => Promise<void>
}

/**
 * Create a test database for the given dialect.
 * For 'postgresql' and 'mysql', starts a Testcontainers container.
 */
export async function createTestDatabase(dialect: Dialect): Promise<TestDatabase> {
  switch (dialect) {
    case 'memory': {
      const db = storium.connect({ dialect: 'memory' })
      return {
        storium: db,
        dialect,
        teardown: () => db.disconnect(),
      }
    }

    case 'postgresql': {
      const { PostgreSqlContainer } = await import('@testcontainers/postgresql')
      const container = await new PostgreSqlContainer('postgres:16-alpine').start()
      const db = storium.connect({
        dialect: 'postgresql',
        url: container.getConnectionUri(),
      })
      return {
        storium: db,
        dialect,
        teardown: async () => {
          await db.disconnect()
          await container.stop()
        },
      }
    }

    case 'mysql': {
      const { MySqlContainer } = await import('@testcontainers/mysql')
      const container = await new MySqlContainer('mysql:8').start()
      const url = `mysql://${container.getUsername()}:${container.getUserPassword()}@${container.getHost()}:${container.getMappedPort(3306)}/${container.getDatabase()}`
      const db = storium.connect({
        dialect: 'mysql',
        url,
      })
      return {
        storium: db,
        dialect,
        teardown: async () => {
          await db.disconnect()
          await container.stop()
        },
      }
    }

    case 'sqlite':
      throw new Error('Use dialect "memory" for SQLite tests, or provide a file path.')

    default:
      throw new Error(`Unknown dialect: ${dialect}`)
  }
}

/**
 * Dialects to test. Override with TEST_DIALECTS env var (comma-separated).
 * Default: only 'memory' for fast unit tests.
 */
export function getTestDialects(): Dialect[] {
  const env = process.env.TEST_DIALECTS
  if (env) return env.split(',').map(d => d.trim()) as Dialect[]
  return ['memory']
}
