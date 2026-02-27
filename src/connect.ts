/**
 * @module connect
 *
 * Creates a fully configured StoriumInstance from either:
 * - A config object (inline or drizzle-kit format)
 * - An existing Drizzle instance (via fromDrizzle)
 *
 * The returned instance has dialect-bound `defineTable`, `register` for
 * materializing store definitions, db-bound `transaction`, and raw
 * `drizzle` and `zod` escape hatches.
 */

import { z } from 'zod'
import type {
  StoriumConfig,
  FromDrizzleOptions,
  StoriumInstance,
  TableDef,
  CustomQueryFn,
  Dialect,
  AssertionRegistry,
} from './core/types'
import { ConfigError } from './core/errors'
import { buildDefineTable, hasMeta } from './core/defineTable'
import { isStoreDefinition } from './core/defineStore'
import { createCreateRepository } from './core/createRepository'
import { createAssertionRegistry } from './core/test'
import { buildSchemaSet } from './core/runtimeSchema'

// createRequire is used intentionally here: connect() is synchronous, and the
// dialect-specific drivers (pg, mysql2, better-sqlite3) must be loaded lazily
// at call time. Switching to async import() would require making connect() async,
// which is a breaking API change. createRequire resolves from cwd so that peer
// dependencies installed in the consumer's node_modules are found correctly.
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(resolve(process.cwd(), 'package.json'))

// --------------------------------------------------- Drizzle Wiring --

/**
 * Resolve the effective dialect (memory → sqlite).
 */
const resolveDialect = (dialect: Dialect): Exclude<Dialect, 'memory'> =>
  dialect === 'memory' ? 'sqlite' : dialect

/**
 * Normalize a connection URL from either storium inline or drizzle-kit config shape.
 */
const resolveUrl = (config: StoriumConfig): string | undefined =>
  config.url ?? config.dbCredentials?.url

/**
 * Create a Drizzle database instance from a connection config.
 * Lazily loads the appropriate driver based on dialect.
 */
const createDrizzleInstance = (config: StoriumConfig): { db: any; teardown: () => Promise<void> } => {
  const dialect = resolveDialect(config.dialect)
  const url = dialect === 'sqlite' && config.dialect === 'memory'
    ? ':memory:'
    : resolveUrl(config) ?? buildConnectionUrl(config)

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
 * Checks both top-level fields and dbCredentials.
 */
const buildConnectionUrl = (config: StoriumConfig): string => {
  const url = resolveUrl(config)
  if (url) return url

  // Try top-level fields first, then dbCredentials
  const host = config.host ?? config.dbCredentials?.host
  const port = config.port ?? config.dbCredentials?.port
  const database = config.database ?? config.dbCredentials?.database
  const user = config.user ?? config.dbCredentials?.user
  const password = config.password ?? config.dbCredentials?.password
  const dialect = config.dialect

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

import { sql } from 'drizzle-orm'

/**
 * Create a `withTransaction` function bound to a Drizzle db instance.
 *
 * For PostgreSQL and MySQL, delegates to Drizzle's built-in transaction
 * which supports async callbacks natively.
 *
 * For SQLite (including memory), better-sqlite3 rejects async callbacks,
 * so we manually manage BEGIN/COMMIT/ROLLBACK and pass the db instance
 * as the transaction context. This works because SQLite serializes all
 * operations on a single connection — the async callback is safe.
 */
const createWithTransaction = (db: any, dialect: Dialect) => {
  if (dialect === 'sqlite') {
    return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      db.run(sql`BEGIN`)
      try {
        const result = await fn(db)
        db.run(sql`COMMIT`)
        return result
      } catch (err) {
        db.run(sql`ROLLBACK`)
        throw err
      }
    }
  }

  return async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    return db.transaction(fn)
  }
}

// --------------------------------------------------- Dialect Inference --

/**
 * Infer the storium dialect string from a Drizzle database instance.
 * Drizzle exposes `db.dialect` as an internal class (PgDialect, etc.).
 */
const inferDialect = (drizzleDb: any): Exclude<Dialect, 'memory'> => {
  const name = drizzleDb?.dialect?.constructor?.name ?? ''
  if (name.includes('Pg')) return 'postgresql'
  if (name.includes('MySql')) return 'mysql'
  if (name.includes('SQLite')) return 'sqlite'
  throw new ConfigError(
    `Could not infer dialect from Drizzle instance (got: '${name}'). ` +
    'Ensure you pass a valid Drizzle database instance.'
  )
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
  const drizzleDialect = resolveDialect(dialect)
  const registry = createAssertionRegistry(assertions)
  const createRepository = createCreateRepository(db, registry)

  const boundDefineTable = buildDefineTable(drizzleDialect, registry)

  /**
   * Rebuild a table's storium schemas with instance-level assertions (if any).
   * Mutates the .storium property in place (safe — called once at startup).
   */
  const applyAssertions = (tableDef: TableDef) => {
    if (Object.keys(registry).length === 0) return tableDef
    const meta = tableDef.storium
    Object.defineProperty(tableDef, 'storium', {
      value: { ...meta, schemas: buildSchemaSet(meta.columns, meta.access, registry) },
      enumerable: false,
      configurable: true,
      writable: false,
    })
    return tableDef
  }

  const register = <T extends Record<string, any>>(
    storeDefs: T
  ): { [K in keyof T]: any } => {
    const result: Record<string, any> = {}

    for (const [key, def] of Object.entries(storeDefs)) {
      if (!isStoreDefinition(def)) {
        throw new ConfigError(
          `register(): '${key}' is not a valid StoreDefinition. ` +
          'Use defineStore(tableDef, { queries }) to create one.'
        )
      }
      result[key] = createRepository(applyAssertions(def.tableDef), def.queries)
    }

    return result as { [K in keyof T]: any }
  }

  /**
   * Create a live store from a table definition (simple path — no register step).
   */
  const instanceDefineStore = (tableDef: TableDef, queries?: Record<string, CustomQueryFn>) => {
    if (!hasMeta(tableDef)) {
      throw new ConfigError(
        'db.defineStore(): first argument must be a table from defineTable().'
      )
    }
    const applied = applyAssertions(tableDef)
    return createRepository(applied, queries ?? {})
  }

  let disconnected = false
  const disconnect = async () => {
    if (disconnected) return
    disconnected = true
    await teardown()
  }

  return {
    drizzle: db,
    zod: z,
    dialect,
    defineTable: boundDefineTable,
    defineStore: instanceDefineStore as StoriumInstance['defineStore'],
    register,
    transaction: createWithTransaction(db, drizzleDialect),
    disconnect,
  }
}

// -------------------------------------------------------- Public API --

/**
 * Create a fully configured StoriumInstance.
 *
 * Accepts both storium's inline config shape and drizzle-kit's config shape.
 * Storium-specific keys (assertions, pool, seeds) are spread alongside
 * drizzle-kit keys in a single flat object.
 *
 * @param config - Config object (inline or drizzle-kit format, with optional storium extras)
 * @returns StoriumInstance with all methods pre-bound
 *
 * @example
 * // Inline config
 * const db = storium.connect({ dialect: 'postgresql', url: '...' })
 *
 * // Drizzle config + storium extras
 * import config from './drizzle.config'
 * const db = storium.connect({ ...config, assertions: { ... } })
 */
export const connect = (config: StoriumConfig): StoriumInstance => {
  if (!config?.dialect) {
    throw new ConfigError('`dialect` is required in connection config')
  }

  const { db, teardown } = createDrizzleInstance(config)

  return buildInstance(
    db,
    config.dialect,
    config.assertions ?? {},
    teardown
  )
}

/**
 * Create a StoriumInstance from an existing Drizzle database instance.
 * Dialect is auto-detected from the Drizzle instance's internal dialect class.
 *
 * @param drizzleDb - A pre-configured Drizzle database instance
 * @param options - Optional storium-specific options (assertions)
 * @returns StoriumInstance with all methods pre-bound
 *
 * @example
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * const myDrizzle = drizzle(myPool)
 * const db = storium.fromDrizzle(myDrizzle)
 * const db = storium.fromDrizzle(myDrizzle, { assertions: { ... } })
 */
export const fromDrizzle = (
  drizzleDb: any,
  options: FromDrizzleOptions = {}
): StoriumInstance => {
  const dialect = inferDialect(drizzleDb)

  // Set $dialect so helpers (e.g. withMembers) can branch on dialect,
  // consistent with instances created via connect().
  drizzleDb.$dialect = dialect

  return buildInstance(
    drizzleDb,
    dialect,
    options.assertions ?? {},
    async () => {} // No-op teardown — user manages their own connection
  )
}
