import { describe, it, expect, beforeAll } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { ConfigError } from '../core/errors'
import { defineStore } from '../core/defineStore'

describe('connect', () => {
  it('returns a StoriumInstance with all expected properties', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(db).toHaveProperty('drizzle')
    expect(db).toHaveProperty('zod')
    expect(db).toHaveProperty('dialect', 'memory')
    expect(typeof db.defineTable).toBe('function')
    expect(typeof db.defineStore).toBe('function')
    expect(typeof db.register).toBe('function')
    expect(typeof db.transaction).toBe('function')
    expect(typeof db.disconnect).toBe('function')
  })

  it('throws ConfigError when dialect is missing', () => {
    expect(() => storium.connect({} as any)).toThrow(ConfigError)
  })

  it('throws ConfigError for unknown dialect', () => {
    expect(() => storium.connect({ dialect: 'oracle' as any })).toThrow(ConfigError)
  })
})

describe('fromDrizzle', () => {
  it('auto-detects sqlite dialect from a better-sqlite3 Drizzle instance', () => {
    const sqlite = new Database(':memory:')
    const drizzleDb = drizzle(sqlite)
    const db = storium.fromDrizzle(drizzleDb)

    expect(db.dialect).toBe('sqlite')
    expect(db.drizzle).toBe(drizzleDb)
    sqlite.close()
  })

  it('throws ConfigError for invalid Drizzle instance', () => {
    expect(() => storium.fromDrizzle({})).toThrow(ConfigError)
    expect(() => storium.fromDrizzle(null)).toThrow(ConfigError)
  })

  it('accepts assertions option', () => {
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
  it('materializes StoreDefinitions into live stores', () => {
    const db = storium.connect({ dialect: 'memory' })
    const table = db.defineTable('items').columns({
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      label: { type: 'varchar', maxLength: 255, required: true },
    }).timestamps(false)

    const itemStore = defineStore(table)
    const { items } = db.register({ items: itemStore })

    expect(typeof items.create).toBe('function')
    expect(typeof items.findById).toBe('function')
    expect(items.schemas).toBeDefined()
  })

  it('throws ConfigError for non-StoreDefinition values', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(() => db.register({ bad: {} as any })).toThrow(ConfigError)
  })
})

describe('db.defineStore (simple path)', () => {
  it('creates a live store from a table definition', () => {
    const db = storium.connect({ dialect: 'memory' })
    const table = db.defineTable('widgets').columns({
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      name: { type: 'varchar', maxLength: 255, required: true },
    }).timestamps(false)
    const widgets = db.defineStore(table)

    expect(typeof widgets.create).toBe('function')
    expect(typeof widgets.findById).toBe('function')
  })

  it('throws ConfigError for non-table values', () => {
    const db = storium.connect({ dialect: 'memory' })
    expect(() => db.defineStore({} as any)).toThrow(ConfigError)
  })
})

describe('transaction', () => {
  let db: any
  let items: any

  beforeAll(() => {
    db = storium.connect({ dialect: 'memory' })
    const table = db.defineTable('tx_items').columns({
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      label: { type: 'varchar', maxLength: 255, required: true },
    }).timestamps(false)
    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS tx_items (id TEXT PRIMARY KEY, label TEXT NOT NULL)
    `)
    items = db.defineStore(table)
  })

  it('commits on success', async () => {
    const result = await db.transaction(async (tx: any) => {
      const a = await items.create({ label: 'A' }, { tx })
      const b = await items.create({ label: 'B' }, { tx })
      return [a, b]
    })

    expect(result).toHaveLength(2)
    const found = await items.findById(result[0].id)
    expect(found).not.toBeNull()
  })

  it('rolls back on error', async () => {
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
  it('is idempotent', async () => {
    const db = storium.connect({ dialect: 'memory' })
    await db.disconnect()
    await db.disconnect() // should not throw
  })
})

describe('assertions integration', () => {
  it('passes assertions through to store validation', async () => {
    const db = storium.connect({
      dialect: 'memory',
      assertions: {
        is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
      },
    })

    const table = db.defineTable('slugs').columns({
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      slug: {
        type: 'varchar',
        maxLength: 255,
        required: true,
        validate: (v, test) => { test(v, 'is_slug', 'Invalid slug') },
      },
    }).timestamps(false)

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS slugs (id TEXT PRIMARY KEY, slug TEXT NOT NULL)
    `)

    const slugs = db.defineStore(table)

    const good = await slugs.create({ slug: 'valid-slug' })
    expect(good.slug).toBe('valid-slug')

    await expect(slugs.create({ slug: 'INVALID SLUG' })).rejects.toThrow()
  })
})
