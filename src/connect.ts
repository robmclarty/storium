/**
 * Storium v1 — Connection Factory
 *
 * Creates a fully configured StoriumInstance from either:
 * - An inline config object
 * - A path to storium.config.ts
 * - No argument (looks for storium.config.ts in project root)
 * - An existing Drizzle instance (via fromDrizzle)
 *
 * The returned instance has dialect-bound `defineTable` and `defineStore`,
 * db-bound `withTransaction`, and a raw `drizzle` escape hatch.
 */

import type {
  ConnectConfig,
  StoriumInstance,
  Dialect,
  AssertionRegistry,
} from './core/types'
import { ConfigError } from './core/errors'
import { createDefineTable } from './core/defineTable'
import { createDefineStore } from './core/defineStore'
import { createAssertionRegistry } from './core/test'

// --------------------------------------------------- Drizzle Wiring --

/**
 * Create a Drizzle database instance from a connection config.
 * Lazily loads the appropriate driver based on dialect.
 */
const resolveDialect = (dialect: Dialect): Exclude<Dialect, 'memory'> =>
  dialect === 'memory' ? 'sqlite' : dialect

const createDrizzleInstance = (config: ConnectConfig): { db: any; teardown: () => Promise<void> } => {
  const dialect = resolveDialect(config.dialect)
  const url = dialect === 'sqlite' && config.dialect === 'memory'
    ? ':memory:'
    : config.url ?? buildConnectionUrl(config)

  switch (dialect) {
    case 'postgresql': {
      const { Pool } = require('pg')
      const { drizzle } = require('drizzle-orm/node-postgres')
      const pool = new Pool({
        connectionString: url,
        min: config.pool?.min,
        max: config.pool?.max,
      })
      const db = drizzle(pool)
      db.$dialect = dialect
      return {
        db,
        teardown: () => pool.end(),
      }
    }

    case 'mysql': {
      const mysql = require('mysql2/promise')
      const { drizzle } = require('drizzle-orm/mysql2')
      const pool = mysql.createPool({
        uri: url,
        ...(config.pool?.max !== undefined && { connectionLimit: config.pool.max }),
      })
      const db = drizzle(pool)
      db.$dialect = dialect
      return {
        db,
        teardown: () => pool.end(),
      }
    }

    case 'sqlite': {
      const Database = require('better-sqlite3')
      const { drizzle } = require('drizzle-orm/better-sqlite3')
      const sqlite = new Database(url === ':memory:' ? ':memory:' : url)
      const db = drizzle(sqlite)
      db.$dialect = dialect
      return {
        db,
        teardown: async () => sqlite.close(),
      }
    }

    default:
      throw new ConfigError(
        `Unknown dialect: '${config.dialect}'. Supported: postgresql, mysql, sqlite, memory`
      )
  }
}

/**
 * Build a connection URL from individual config fields.
 */
const buildConnectionUrl = (config: ConnectConfig): string => {
  if (config.url) return config.url

  const { dialect, host, port, database, user, password } = config

  if (!host || !database) {
    throw new ConfigError(
      'Either `url` or `host` + `database` must be provided in connection config'
    )
  }

  switch (dialect) {
    case 'postgresql': {
      const auth = user ? `${user}${password ? `:${password}` : ''}@` : ''
      return `postgresql://${auth}${host}${port ? `:${port}` : ''}/${database}`
    }
    case 'mysql': {
      const auth = user ? `${user}${password ? `:${password}` : ''}@` : ''
      return `mysql://${auth}${host}${port ? `:${port}` : ''}/${database}`
    }
    case 'sqlite':
      return database
    default:
      throw new ConfigError(`Cannot build URL for dialect: ${dialect}`)
  }
}

// ------------------------------------------------ Transaction Helper --

/**
 * Create a `withTransaction` function bound to a Drizzle db instance.
 */
const createWithTransaction = (db: any) => {
  return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return db.transaction(fn)
  }
}

// ---------------------------------------------------- Instance Builder --

/**
 * Build a StoriumInstance from a Drizzle db, dialect, and assertions.
 * Used by both `connect()` and `fromDrizzle()`.
 */
const buildInstance = (
  db: any,
  dialect: Dialect,
  assertions: AssertionRegistry,
  teardown: () => Promise<void>
): StoriumInstance => {
  const registry = createAssertionRegistry(assertions)

  return {
    drizzle: db,
    dialect,
    defineTable: createDefineTable(dialect, registry),
    defineStore: createDefineStore(dialect, db, registry),
    withTransaction: createWithTransaction(db),
    disconnect: teardown,
  }
}

// -------------------------------------------------------- Public API --

/**
 * Create a fully configured StoriumInstance.
 *
 * @param config - Inline config object with dialect, connection, and assertions
 * @returns StoriumInstance with all methods pre-bound
 *
 * @example
 * const db = storium.connect({
 *   dialect: 'postgresql',
 *   url: process.env.DATABASE_URL,
 *   assertions: { is_slug: (v) => /^[a-z0-9-]+$/.test(v) },
 * })
 */
export const connect = (config: ConnectConfig): StoriumInstance => {
  if (!config?.dialect) {
    throw new ConfigError('`dialect` is required in connection config')
  }

  const dialect = resolveDialect(config.dialect)
  const { db, teardown } = createDrizzleInstance(config)

  return buildInstance(
    db,
    dialect,
    config.assertions ?? {},
    teardown
  )
}

/**
 * Create a StoriumInstance from an existing Drizzle database instance.
 * Use this when you need fine-grained control over Drizzle configuration.
 *
 * @param drizzleDb - A pre-configured Drizzle database instance
 * @param config - Dialect and optional assertions
 * @returns StoriumInstance with all methods pre-bound
 *
 * @example
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * const myDrizzle = drizzle(myPool)
 * const db = storium.fromDrizzle(myDrizzle, { dialect: 'postgresql' })
 */
export const fromDrizzle = (
  drizzleDb: any,
  config: { dialect: Dialect; assertions?: AssertionRegistry }
): StoriumInstance => {
  if (!config?.dialect) {
    throw new ConfigError('`dialect` is required when using fromDrizzle()')
  }

  const dialect = resolveDialect(config.dialect)
  drizzleDb.$dialect = dialect

  return buildInstance(
    drizzleDb,
    dialect,
    config.assertions ?? {},
    async () => {} // No-op teardown — user manages their own connection
  )
}
