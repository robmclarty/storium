/**
 * @module connect
 *
 * Creates a fully configured StoriumInstance from either:
 * - A config object (inline or drizzle-kit format)
 * - An existing Drizzle instance (via fromDrizzle)
 *
 * The returned instance has `defineStore` for creating live stores,
 * `register` for materializing store definitions, db-bound `transaction`,
 * and raw `drizzle` and `zod` escape hatches.
 */

import { z } from 'zod'
import type { Table } from 'drizzle-orm'
import type {
  StoriumConfig,
  FromDrizzleOptions,
  StoriumInstance,
  TableDef,
  Store,
  InferStore,
  Dialect,
  AssertionRegistry,
  DrizzleDatabase,
  InferDialect,
  StoreConfig,
} from './types'
import { ConfigError } from './errors'
import { isStoreDefinition, hasMeta, attachStoriumMeta } from './store/define'
import { createCreateRepository } from './store/repository'
import { createAssertionRegistry } from './assertions'
import { buildSchemaSet } from './schema/zod'

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
 *
 * Pool configuration notes:
 * - **PostgreSQL**: Maps `pool.min` and `pool.max` directly to pg's Pool options.
 * - **MySQL**: Maps `pool.max` to mysql2's `connectionLimit`. The `pool.min`
 *   option is **not supported** by mysql2 — it has no minimum idle connection
 *   setting. Other mysql2 pool options (waitForConnections, queueLimit,
 *   enableKeepAlive) are not exposed; use `fromDrizzle()` with a custom pool
 *   for advanced configuration.
 * - **SQLite**: No pool — single synchronous connection.
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
const buildAuthHost = (
  user: string | undefined,
  password: string | undefined,
  host: string,
  port: number | undefined
): string => {
  const enc = (s: string) => encodeURIComponent(s)
  const auth = user ? `${enc(user)}${password ? `:${enc(password)}` : ''}@` : ''
  const portSuffix = port ? `:${port}` : ''
  return `${auth}${host}${portSuffix}`
}

const buildConnectionUrl = (config: StoriumConfig): string => {
  const url = resolveUrl(config)
  if (url) return url

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
    case 'postgresql':
      return `postgresql://${buildAuthHost(user, password, host, port)}/${database}`
    case 'mysql':
      return `mysql://${buildAuthHost(user, password, host, port)}/${database}`
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
 * SQLite (better-sqlite3) note: Drizzle's `db.transaction()` is synchronous
 * and rejects async callbacks. We use manual BEGIN/COMMIT/ROLLBACK instead.
 * This is safe for better-sqlite3 because it operates on a single synchronous
 * connection — all statements within the callback execute serially on the
 * same connection, and the BEGIN/COMMIT brackets them correctly.
 *
 * The callback receives the `db` instance as `tx`. For better-sqlite3 this
 * is the same object (single connection), but callers should use `tx` to
 * stay consistent with the PostgreSQL/MySQL transaction pattern where `tx`
 * is a distinct scoped handle.
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
const buildInstance = <D extends Dialect>(
  db: DrizzleDatabase<D>,
  dialect: D,
  assertions: AssertionRegistry,
  teardown: () => Promise<void>
): StoriumInstance<D> => {
  const drizzleDialect = resolveDialect(dialect)
  const registry = createAssertionRegistry(assertions)
  const createRepository = createCreateRepository(db, registry, dialect)

  /**
   * Rebuild a table's storium schemas with instance-level assertions (if any).
   * Mutates the .storium property in place (safe — called once at startup).
   */
  const applyAssertions = (tableDef: TableDef) => {
    if (Object.keys(registry).length === 0) return tableDef
    const meta = tableDef.storium
    Object.defineProperty(tableDef, 'storium', {
      value: { ...meta, schemas: buildSchemaSet(tableDef, meta.annotations, meta.access, registry) },
      enumerable: false,
      configurable: true,
      writable: false,
    })
    return tableDef
  }

  const register = <T extends Record<string, any>>(
    storeDefs: T
  ): { [K in keyof T]: InferStore<T[K]> } => {
    const result: Record<string, any> = {}

    for (const [key, def] of Object.entries(storeDefs)) {
      if (!isStoreDefinition(def)) {
        throw new ConfigError(
          `register(): '${key}' is not a valid StoreDefinition. ` +
          'Use defineStore(drizzleTable) to create one.'
        )
      }
      result[key] = createRepository(applyAssertions(def.tableDef as unknown as TableDef), def.queryFns)
    }

    return result as { [K in keyof T]: InferStore<T[K]> }
  }

  /**
   * Create a live store from a Drizzle table (simple path — no register step).
   */
  const instanceDefineStore = <TTable extends Table = Table>(
    drizzleTable: TTable,
    config: StoreConfig = {}
  ) => {
    // Attach storium metadata if not already present
    if (!hasMeta(drizzleTable)) {
      attachStoriumMeta(drizzleTable, config, registry)
    } else if (config.columns || config.softDelete !== undefined) {
      console.warn(
        `storium: defineStore() received config for table '${(drizzleTable as any).storium.name}' ` +
        'which already has storium metadata. The config will be ignored. ' +
        'Remove the config argument or use a table without existing metadata.'
      )
    }
    const applied = applyAssertions(drizzleTable as unknown as TableDef)
    const baseStore = createRepository<TTable>(applied, {})

    // Attach non-enumerable .queries() that creates a new store with queries
    Object.defineProperty(baseStore, 'queries', {
      value: <TKeys extends string>(queryFns: Record<TKeys, any>) =>
        createRepository<TTable, Record<TKeys, any>>(applied, queryFns),
      enumerable: false,
      configurable: true,
      writable: false,
    })

    return baseStore as unknown as Store<TTable>
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
    defineStore: instanceDefineStore,
    register,
    transaction: createWithTransaction(db as any, drizzleDialect),
    disconnect,
  } as StoriumInstance<D>
}

// -------------------------------------------------------- Public API --

/**
 * Create a fully configured StoriumInstance.
 */
export const connect = <D extends Dialect>(config: StoriumConfig<D>): StoriumInstance<D> => {
  if (!config?.dialect) {
    throw new ConfigError('`dialect` is required in connection config')
  }

  const { db, teardown } = createDrizzleInstance(config as StoriumConfig)

  return buildInstance<D>(
    db as DrizzleDatabase<D>,
    config.dialect,
    config.assertions ?? {},
    teardown
  )
}

/**
 * Create a StoriumInstance from an existing Drizzle database instance.
 * Dialect is auto-detected from the Drizzle instance's internal dialect class.
 *
 * When `options.dialect` is provided, the return type uses that literal dialect
 * instead of the inferred one — useful when bundlers mangle class names.
 */
export function fromDrizzle<DB extends DrizzleDatabase, D extends Exclude<Dialect, 'memory'>>(
  drizzleDb: DB,
  options: FromDrizzleOptions & { dialect: D }
): StoriumInstance<D>
export function fromDrizzle<DB extends DrizzleDatabase>(
  drizzleDb: DB,
  options?: FromDrizzleOptions
): StoriumInstance<InferDialect<DB>>
export function fromDrizzle(
  drizzleDb: any,
  options: FromDrizzleOptions = {}
): StoriumInstance<any> {
  const dialect = options.dialect ?? inferDialect(drizzleDb)

  return buildInstance(
    drizzleDb,
    dialect,
    options.assertions ?? {},
    async () => {} // No-op teardown — user manages their own connection
  )
}
