import { describe, it, expect, beforeAll } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { ConfigError } from '../errors'
import { defineStore } from '../store/define'

describe('connect', () => {
  /* QA-10004 */ it('[QA-10004] returns a StoriumInstance with all expected properties', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(db).toHaveProperty('drizzle')
    expect(db).toHaveProperty('zod')
    expect(db).toHaveProperty('dialect', 'memory')
    expect(typeof db.defineStore).toBe('function')
    expect(typeof db.register).toBe('function')
    expect(typeof db.transaction).toBe('function')
    expect(typeof db.disconnect).toBe('function')
  })

  /* QA-10005 */ it('[QA-10005] throws ConfigError when dialect is missing', () => {
    expect(() => storium.connect({} as any)).toThrow(ConfigError)
  })

  /* QA-10006 */ it('[QA-10006] throws ConfigError for unknown dialect', () => {
    expect(() => storium.connect({ dialect: 'oracle' as any })).toThrow(ConfigError)
  })
})

describe('fromDrizzle', () => {
  /* QA-10007 */ it('[QA-10007] auto-detects sqlite dialect from a better-sqlite3 Drizzle instance', () => {
    const sqlite = new Database(':memory:')
    const drizzleDb = drizzle(sqlite)
    const db = storium.fromDrizzle(drizzleDb)

    expect(db.dialect).toBe('sqlite')
    expect(db.drizzle).toBe(drizzleDb)
    sqlite.close()
  })

  /* QA-10008 */ it('[QA-10008] throws ConfigError for invalid Drizzle instance', () => {
    expect(() => storium.fromDrizzle({})).toThrow(ConfigError)
    expect(() => storium.fromDrizzle(null)).toThrow(ConfigError)
  })

  /* QA-10009 */ it('[QA-10009] uses explicit dialect when provided, bypassing inference', () => {
    const sqlite = new Database(':memory:')
    const drizzleDb = drizzle(sqlite)

    const db = storium.fromDrizzle(drizzleDb, { dialect: 'sqlite' })
    expect(db.dialect).toBe('sqlite')

    sqlite.close()
  })

  /* QA-10010 */ it('[QA-10010] accepts assertions option', () => {
    const sqlite = new Database(':memory:')
    const drizzleDb = drizzle(sqlite)
    const db = storium.fromDrizzle(drizzleDb, {
      assertions: { is_slug: (v) => typeof v === 'string' },
    })

    expect(db.dialect).toBe('sqlite')
    sqlite.close()
  })
})

describe('register', () => {
  /* QA-10011 */ it('[QA-10011] materializes StoreDefinitions into live stores', () => {
    const db = storium.connect({ dialect: 'memory' })

    const itemsTable = sqliteTable('items', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      label: text('label').notNull(),
    })

    const itemStore = defineStore(itemsTable, {
      columns: { label: { required: true } },
    })
    const { items } = db.register({ items: itemStore })

    expect(typeof items.create).toBe('function')
    expect(typeof items.findById).toBe('function')
    expect(items.schemas).toBeDefined()
  })

  /* QA-10012 */ it('[QA-10012] throws ConfigError for non-StoreDefinition values', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(() => db.register({ bad: {} as any })).toThrow(ConfigError)
  })
})

describe('db.defineStore (simple path)', () => {
  /* QA-10013 */ it('[QA-10013] creates a live store from a Drizzle table', () => {
    const db = storium.connect({ dialect: 'memory' })

    const widgetsTable = sqliteTable('widgets', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      name: text('name').notNull(),
    })

    const widgets = db.defineStore(widgetsTable, {
      columns: { name: { required: true } },
    })

    expect(typeof widgets.create).toBe('function')
    expect(typeof widgets.findById).toBe('function')
  })

  /* QA-10014 */ it('[QA-10014] throws ConfigError for non-table values', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(() => db.defineStore({} as any)).toThrow()
  })
})

describe('transaction', () => {
  let db: any
  let items: any

  beforeAll(() => {
    db = storium.connect({ dialect: 'memory' })

    const itemsTable = sqliteTable('tx_items', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      label: text('label').notNull(),
    })

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS tx_items (id TEXT PRIMARY KEY, label TEXT NOT NULL)
    `)

    items = db.defineStore(itemsTable, {
      columns: { label: { required: true } },
    })
  })

  /* QA-10015 */ it('[QA-10015] commits on success', async () => {
    const result = await db.transaction(async (tx: any) => {
      const a = await items.create({ label: 'A' }, { tx })
      const b = await items.create({ label: 'B' }, { tx })
      return [a, b]
    })

    expect(result).toHaveLength(2)
    const found = await items.findById(result[0].id)
    expect(found).not.toBeNull()
  })

  /* QA-10016 */ it('[QA-10016] rolls back on error', async () => {
    let createdId: string | undefined

    try {
      await db.transaction(async (tx: any) => {
        const item = await items.create({ label: 'Rollback' }, { tx })
        createdId = item.id
        throw new Error('intentional')
      })
    } catch {
      // expected
    }

    if (createdId) {
      const found = await items.findById(createdId)
      expect(found).toBeNull()
    }
  })

  /* QA-10415 */ it('[QA-10415] accepts an isolationLevel and ignores it on SQLite/memory (no-op, still commits)', async () => {
    // SQLite is inherently serializable, so the option is a no-op here; the
    // transaction must still commit normally. (PG/MySQL plumbing is covered by
    // the integration suite.)
    const result = await db.transaction(
      async (tx: any) => items.create({ label: 'Isolated' }, { tx }),
      { isolationLevel: 'serializable' }
    )

    const found = await items.findById(result.id)
    expect(found).not.toBeNull()
    expect(found.label).toBe('Isolated')
  })
})

describe('driver options', () => {
  // pg.Pool and mysql2.createPool both defer connecting until first use, so a
  // config-level assertion needs no database: construct, inspect what the driver
  // stored, disconnect. `db.drizzle.$client` is the pool drizzle was handed; its
  // `options` (pg-pool) and `pool.config` (mysql2) are stable internals rather
  // than public types, hence the reads through `unknown`. Port 1 is never
  // dialed.
  const PG_URL = 'postgresql://storium:storium@127.0.0.1:1/storium'
  const MYSQL_URL = 'mysql://storium:storium@127.0.0.1:1/storium'

  const pgOptions = (db: { drizzle: unknown }) =>
    (db.drizzle as { $client: { options: Record<string, unknown> } }).$client.options

  const mysqlPoolConfig = (db: { drizzle: unknown }) =>
    (db.drizzle as {
      $client: { pool: { config: { connectionConfig: Record<string, unknown>; waitForConnections: boolean } } }
    }).$client.pool.config

  /* QA-10417 */ it('[QA-10417] pg: spreads driver options into pg.Pool alongside the URL', async () => {
    const db = storium.connect({
      dialect: 'postgresql',
      url: PG_URL,
      driver: { ssl: { rejectUnauthorized: false }, application_name: 'storium-test' },
    })
    const options = pgOptions(db)
    expect(options.connectionString).toBe(PG_URL)
    expect(options.ssl).toEqual({ rejectUnauthorized: false })
    expect(options.application_name).toBe('storium-test')
    await db.disconnect()
  })

  /* QA-10418 */ it('[QA-10418] pg: pool.min / pool.max win over the same keys in driver', async () => {
    const db = storium.connect({
      dialect: 'postgresql',
      url: PG_URL,
      pool: { min: 1, max: 3 },
      driver: { min: 50, max: 99 },
    })
    expect(pgOptions(db).min).toBe(1)
    expect(pgOptions(db).max).toBe(3)
    await db.disconnect()
  })

  /* QA-10419 */ it('[QA-10419] pg: a driver-supplied max survives when pool is not given', async () => {
    // Guards the conditional spread: the old code passed `max: undefined`
    // explicitly, which would have overwritten this 7 and let pg-pool fall back
    // to its default of 10.
    const db = storium.connect({ dialect: 'postgresql', url: PG_URL, driver: { max: 7 } })
    expect(pgOptions(db).max).toBe(7)
    await db.disconnect()
  })

  /* QA-10420 */ it('[QA-10420] pg: rejects driver.connectionString and URL components with ConfigError', () => {
    expect(() => storium.connect({
      dialect: 'postgresql',
      url: PG_URL,
      driver: { connectionString: 'postgresql://elsewhere/other' },
    })).toThrow(ConfigError)
    expect(() => storium.connect({
      dialect: 'postgresql',
      url: PG_URL,
      driver: { database: 'other' },
    })).toThrow(ConfigError)
  })

  /* QA-10421 */ it('[QA-10421] mysql: spreads driver options into mysql2.createPool alongside the URL', async () => {
    const db = storium.connect({
      dialect: 'mysql',
      url: MYSQL_URL,
      driver: { ssl: { rejectUnauthorized: false }, waitForConnections: false },
    })
    const config = mysqlPoolConfig(db)
    expect(config.connectionConfig.ssl).toEqual({ rejectUnauthorized: false })
    expect(config.connectionConfig.host).toBe('127.0.0.1')
    expect(config.connectionConfig.database).toBe('storium')
    expect(config.waitForConnections).toBe(false)
    await db.disconnect()
  })

  /* QA-10422 */ it('[QA-10422] mysql: rejects driver.uri and URL components with ConfigError', () => {
    expect(() => storium.connect({
      dialect: 'mysql',
      url: MYSQL_URL,
      driver: { uri: 'mysql://elsewhere/other' },
    })).toThrow(ConfigError)
    // The case that motivates reserving components: mysql2 lets a discrete
    // `host` win over the one parsed from `uri`, so this would otherwise connect
    // somewhere other than the database the config names.
    expect(() => storium.connect({
      dialect: 'mysql',
      url: MYSQL_URL,
      driver: { host: 'elsewhere' },
    })).toThrow(ConfigError)
  })

  /* QA-10423 */ it('[QA-10423] sqlite/memory: passes driver options to better-sqlite3', async () => {
    const statements: string[] = []
    const db = storium.connect({
      dialect: 'memory',
      driver: { verbose: (statement: string) => { statements.push(statement) } },
    })
    db.drizzle.run(sql`SELECT 1`)
    expect(statements.some((statement) => statement.includes('SELECT 1'))).toBe(true)
    await db.disconnect()
  })

  /* QA-10424 */ it('[QA-10424] omitting driver leaves the pool exactly as before', async () => {
    const db = storium.connect({ dialect: 'postgresql', url: PG_URL, pool: { max: 4 } })
    const options = pgOptions(db)
    expect(options.connectionString).toBe(PG_URL)
    expect(options.max).toBe(4)
    expect(options.ssl).toBeUndefined()
    await db.disconnect()
  })
})

describe('disconnect', () => {
  /* QA-10017 */ it('[QA-10017] is idempotent', async () => {
    const db = storium.connect({ dialect: 'memory' })
    await db.disconnect()
    await db.disconnect() // should not throw
  })
})

describe('assertions integration', () => {
  /* QA-10018 */ it('[QA-10018] passes assertions through to store validation', async () => {
    const db = storium.connect({
      dialect: 'memory',
      assertions: {
        is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
      },
    })

    const slugsTable = sqliteTable('slugs', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      slug: text('slug').notNull(),
    })

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS slugs (id TEXT PRIMARY KEY, slug TEXT NOT NULL)
    `)

    const slugs = db.defineStore(slugsTable, {
      columns: {
        slug: {
          required: true,
          validate: (v, test) => { test(v, 'is_slug', 'Invalid slug') },
        },
      },
    })

    const good = await slugs.create({ slug: 'valid-slug' })
    expect(good.slug).toBe('valid-slug')

    await expect(slugs.create({ slug: 'INVALID SLUG' })).rejects.toThrow()
  })
})

describe('logger', () => {
  /* QA-10412 */ it('[QA-10412] routes the defineStore re-config warning to a custom logger (not console)', () => {
    const warnings: string[] = []
    const logger = {
      log: () => {},
      warn: (msg: string) => { warnings.push(msg) },
      error: () => {},
    }

    const db = storium.connect({ dialect: 'memory', logger })
    expect(db.logger).toBe(logger)

    const t = sqliteTable('logger_users', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    db.defineStore(t)                                          // attaches metadata
    db.defineStore(t, { columns: { name: { required: true } } }) // re-config → warn

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('already has storium metadata')
  })

  /* QA-10414 */ it('[QA-10414] defaults the instance logger to console when none is configured', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(db.logger).toBe(console)
  })
})
