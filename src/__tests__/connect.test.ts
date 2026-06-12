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
