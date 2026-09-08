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
import { is, sql } from 'drizzle-orm'
import type { Table } from 'drizzle-orm'
import { PgDatabase } from 'drizzle-orm/pg-core'
import { MySqlDatabase } from 'drizzle-orm/mysql-core'
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
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
  Logger,
  TransactionOptions,
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
 * The connection URL storium hands the driver: a caller-supplied `url` /
 * `dbCredentials.url`, else one built from discrete host/port/user/database.
 * Computed lazily per dialect branch so the function-password branch (which
 * builds the pg pool from components, never a URL) never calls
 * `buildConnectionUrl` with a function it cannot encode.
 */
const resolveConnectionUrl = (config: StoriumConfig): string =>
  resolveUrl(config) ?? buildConnectionUrl(config)

/**
 * `driverOptions` may not carry the connection URL or any of its components.
 * Either outcome of allowing it is bad, and the two drivers pick opposite ones:
 * pg lets the parsed `connectionString` win, so a `driverOptions.host` is
 * silently ignored; mysql2 lets a discrete `host` win over the one parsed from
 * `uri`, so a `driverOptions.host` silently connects somewhere other than the
 * database the config names. Failing at `connect()` is the only behavior that
 * is not a surprise later, and reserving the same set for both dialects keeps
 * the contract portable: the URL is `url` / `dbCredentials`' job, everything
 * else is yours.
 */
const URL_COMPONENT_KEYS = ['host', 'port', 'user', 'password', 'database'] as const

const assertDriverOptionsDoNotSetUrl = (
  driverOptions: Record<string, unknown> | undefined,
  urlKey: string
): void => {
  if (driverOptions === undefined) return
  const offending = [urlKey, ...URL_COMPONENT_KEYS].find((key) => key in driverOptions)
  if (offending !== undefined) {
    throw new ConfigError(
      `\`driverOptions.${offending}\` is not allowed: the connection URL and its parts come from \`url\` / \`dbCredentials\`, not \`driverOptions\`. Remove it from \`driverOptions\`.`
    )
  }
}

/**
 * A function `password` is honoured only on postgresql, where pg resolves it once
 * per connection (D1). Every other driver takes a static string — mysql2's
 * `password` is a string, better-sqlite3 has none — so a function here is a
 * ConfigError at connect() rather than a value silently stringified into a DSN or
 * a failure surfaced minutes later on the first checkout.
 */
const assertPasswordFnSupported = (
  config: StoriumConfig,
  dialect: Exclude<Dialect, 'memory'>
): void => {
  const password = config.password ?? config.dbCredentials?.password
  if (typeof password === 'function' && dialect !== 'postgresql') {
    throw new ConfigError(
      `\`password\` as a function is only supported on the postgresql dialect, where pg resolves it once per connection. The '${config.dialect}' driver takes a string and has no per-connection hook. Resolve the credential yourself and pass a string, or use fromDrizzle() with a pool you manage.`
    )
  }
}

/**
 * Create a Drizzle database instance from a connection config.
 * Lazily loads the appropriate driver based on dialect.
 *
 * Pool configuration notes:
 * - **PostgreSQL**: Maps `pool.min` and `pool.max` directly to pg's Pool options.
 * - **MySQL**: Maps `pool.max` to mysql2's `connectionLimit`. The `pool.min`
 *   option is **not supported** by mysql2 — it has no minimum idle connection
 *   setting.
 * - **SQLite**: No pool — single synchronous connection.
 *
 * Anything else the driver accepts (TLS, timeouts, `application_name`, mysql2's
 * `waitForConnections` / `queueLimit`, better-sqlite3's `verbose`) goes through
 * `config.driverOptions`, spread into the constructor call **first** so that the
 * keys storium owns — the URL and the `pool` mapping — win on collision. The URL
 * and its components are rejected outright rather than overridden: see
 * `assertDriverOptionsDoNotSetUrl`.
 */
const createDrizzleInstance = (config: StoriumConfig): { db: any; teardown: () => Promise<void> } => {
  const dialect = resolveDialect(config.dialect)
  assertPasswordFnSupported(config, dialect)

  switch (dialect) {
    case 'postgresql': {
      let Pool: any, drizzle: any
      try {
        Pool = require('pg').Pool
        drizzle = require('drizzle-orm/node-postgres').drizzle
      } catch (e: any) {
        if (e?.code === 'MODULE_NOT_FOUND') {
          throw new ConfigError('PostgreSQL driver not found. Install it: npm install pg')
        }
        throw e
      }
      assertDriverOptionsDoNotSetUrl(config.driverOptions, 'connectionString')
      const pool = buildPgPool(Pool, config)
      const db = drizzle(pool)

      return {
        db,
        teardown: () => pool.end(),
      }
    }

    case 'mysql': {
      let mysql: any, drizzle: any
      try {
        mysql = require('mysql2/promise')
        drizzle = require('drizzle-orm/mysql2').drizzle
      } catch (e: any) {
        if (e?.code === 'MODULE_NOT_FOUND') {
          throw new ConfigError('MySQL driver not found. Install it: npm install mysql2')
        }
        throw e
      }
      assertDriverOptionsDoNotSetUrl(config.driverOptions, 'uri')
      const pool = mysql.createPool({
        ...config.driverOptions,
        uri: resolveConnectionUrl(config),
        ...(config.pool?.max !== undefined && { connectionLimit: config.pool.max }),
      })
      const db = drizzle(pool)

      return {
        db,
        teardown: () => pool.end(),
      }
    }

    case 'sqlite': {
      let Database: any, drizzle: any
      try {
        Database = require('better-sqlite3')
        drizzle = require('drizzle-orm/better-sqlite3').drizzle
      } catch (e: any) {
        if (e?.code === 'MODULE_NOT_FOUND') {
          throw new ConfigError('SQLite driver not found. Install it: npm install better-sqlite3')
        }
        throw e
      }
      const url = config.dialect === 'memory' ? ':memory:' : resolveConnectionUrl(config)
      const sqlite = new Database(url === ':memory:' ? ':memory:' : url, config.driverOptions ?? {})
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
const enc = (s: string) => encodeURIComponent(s)

const buildAuthHost = (
  user: string | undefined,
  password: string | undefined,
  host: string,
  port: number | undefined
): string => {
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

  if (typeof password === 'function') {
    throw new ConfigError('`password` is a function and cannot be encoded into a connection URL.')
  }

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

/**
 * The discrete pg connection target used on the function-password branch, where
 * the pool is built from components rather than a `connectionString` (D2).
 */
type PgTarget = { host: string; port?: number; user?: string; database: string }

/**
 * Resolve `host`/`port`/`user`/`database` for the pg function-password branch.
 *
 * When components are given they win, using the same `inline ?? dbCredentials`
 * precedence as `buildConnectionUrl`. When a `url` is given it is parsed with
 * Node's built-in WHATWG `URL` — no `pg-connection-string` import (C1) — which
 * percent-encodes the username and pathname and brackets IPv6 hosts, so both are
 * decoded and the brackets stripped, mirroring `pg-connection-string` (D3). A
 * missing port passes no `port`, letting pg default (D9). A missing host or
 * database is the same `ConfigError` `buildConnectionUrl` throws.
 */
const resolvePgTarget = (config: StoriumConfig): PgTarget => {
  const url = resolveUrl(config)

  if (url === undefined) {
    const host = config.host ?? config.dbCredentials?.host
    const database = config.database ?? config.dbCredentials?.database
    if (!host || !database) {
      throw new ConfigError(
        'Either `url` or `host` + `database` must be provided in connection config'
      )
    }
    const port = config.port ?? config.dbCredentials?.port
    const user = config.user ?? config.dbCredentials?.user
    return {
      host,
      ...(port !== undefined && { port }),
      ...(user !== undefined && { user }),
      database,
    }
  }

  const parsed = new URL(url)
  const host = parsed.hostname.replace(/^\[|\]$/g, '') // strip IPv6 brackets
  const database = decodeURIComponent(parsed.pathname.slice(1))
  if (!host || !database) {
    throw new ConfigError(
      'Either `url` or `host` + `database` must be provided in connection config'
    )
  }
  return {
    host,
    ...(parsed.port !== '' && { port: Number(parsed.port) }),
    ...(parsed.username !== '' && { user: decodeURIComponent(parsed.username) }),
    database,
  }
}

/**
 * Build the pg pool. A function `password` is resolved once per connection, but
 * only if pg never merges a parsed DSN over the explicit config — so the pool is
 * built from discrete host/port/user/database components with no
 * `connectionString`, and the function is handed to pg untouched (D2, D5). Even a
 * passwordless DSN parses to `password: ""` and would clobber it. A string or
 * absent password keeps the `connectionString` path byte-for-byte (D6): the DSN
 * carries query parameters (`sslmode`, …) the component path cannot.
 *
 * `driverOptions` is spread first so storium's keys win; `pool.min` / `pool.max`
 * win last over any `min` / `max` a caller put in `driverOptions`.
 */
const buildPgPool = (Pool: any, config: StoriumConfig): any => {
  const poolMinMax = {
    ...(config.pool?.min !== undefined && { min: config.pool.min }),
    ...(config.pool?.max !== undefined && { max: config.pool.max }),
  }
  const password = config.password ?? config.dbCredentials?.password

  return typeof password === 'function'
    ? new Pool({ ...config.driverOptions, ...resolvePgTarget(config), password, ...poolMinMax })
    : new Pool({ ...config.driverOptions, connectionString: resolveConnectionUrl(config), ...poolMinMax })
}

// ------------------------------------------------ Transaction Helper --

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
 *
 * `opts.isolationLevel` is plumbed to Drizzle's transaction config on
 * PostgreSQL/MySQL. SQLite (better-sqlite3) has no isolation-level knob — it's
 * already serialized — so the option is ignored on the manual BEGIN/COMMIT path.
 */
const createWithTransaction = (db: any, dialect: Dialect) => {
  if (dialect === 'sqlite') {
    return async <T>(fn: (tx: any) => Promise<T>, _opts?: TransactionOptions): Promise<T> => {
      // SQLite is inherently serializable; `_opts.isolationLevel` does not apply.
      db.run(sql`BEGIN`)
      try {
        const result = await fn(db)
        db.run(sql`COMMIT`)
        return result
      } catch (err) {
        try {
          db.run(sql`ROLLBACK`)
        } catch {
          // ROLLBACK failed — original error is more important
        }
        throw err
      }
    }
  }

  return async <T>(fn: (tx: any) => Promise<T>, opts?: TransactionOptions): Promise<T> => {
    // Drizzle accepts a per-transaction config on PostgreSQL/MySQL; pass it only
    // when an isolation level is requested so the default path is untouched.
    return opts?.isolationLevel
      ? db.transaction(fn, { isolationLevel: opts.isolationLevel })
      : db.transaction(fn)
  }
}

// --------------------------------------------------- Dialect Inference --

/**
 * Infer the storium dialect string from a Drizzle database instance.
 * Uses Drizzle's `is()` utility which checks the stable `entityKind` symbol —
 * survives bundlers and minifiers unlike constructor name matching.
 */
const inferDialect = (drizzleDb: any): Exclude<Dialect, 'memory'> => {
  if (is(drizzleDb, PgDatabase)) return 'postgresql'
  if (is(drizzleDb, MySqlDatabase)) return 'mysql'
  if (is(drizzleDb, BaseSQLiteDatabase)) return 'sqlite'
  throw new ConfigError(
    `Could not infer dialect from Drizzle instance. ` +
    `Pass { dialect: 'postgresql' | 'mysql' | 'sqlite' } explicitly.`
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
  teardown: () => Promise<void>,
  logger: Logger
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
      logger.warn(
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
    await teardown()
    disconnected = true
  }

  return {
    drizzle: db,
    zod: z,
    dialect,
    logger,
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

  try {
    return buildInstance<D>(
      db as DrizzleDatabase<D>,
      config.dialect,
      config.assertions ?? {},
      teardown,
      config.logger ?? console
    )
  } catch (err) {
    teardown().catch(() => {})
    throw err
  }
}

/**
 * Create a StoriumInstance from an existing Drizzle database instance.
 * Dialect is auto-detected via Drizzle's stable entityKind symbol.
 *
 * Pass `options.dialect` to override inference and narrow the return type.
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
    async () => {}, // No-op teardown — user manages their own connection
    options.logger ?? console
  )
}
