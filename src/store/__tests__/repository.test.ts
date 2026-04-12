import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sql, gt, like } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { attachStoriumMeta } from '../define'
import { createCreateRepository } from '../repository'
import { StoreError } from '../../errors'

// --------------------------------------------------------------- Helpers --

const createDb = () => {
  const sqlite = new Database(':memory:')
  return drizzle(sqlite)
}

// ----------------------------------------------------------------- Tests --

describe('CRUD operations', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
      age: integer('age'),
    })

    db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        age INTEGER
      )
    `)

    attachStoriumMeta(usersTable, {
      columns: {
        email: {
          required: true,
          transform: (v) => (v as string).trim().toLowerCase(),
        },
      },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('creates a record and returns it with an ID', async () => {
    const user = await users.create({ email: 'alice@example.com', name: 'Alice' })
    expect(user).toHaveProperty('id')
    expect(user.email).toBe('alice@example.com')
    expect(user.name).toBe('Alice')
  })

  it('findById returns the created record', async () => {
    const user = await users.create({ email: 'find@example.com' })
    const found = await users.findById(user.id)
    expect(found).not.toBeNull()
    expect(found.id).toBe(user.id)
  })

  it('findById returns null for non-existent ID', async () => {
    const found = await users.findById('00000000-0000-0000-0000-000000000000')
    expect(found).toBeNull()
  })

  it('update modifies the record and returns it', async () => {
    const user = await users.create({ email: 'update@example.com', name: 'Before' })
    const updated = await users.update(user.id, { name: 'After' })
    expect(updated.name).toBe('After')
    expect(updated.id).toBe(user.id)
  })

  it('destroy deletes the record', async () => {
    const user = await users.create({ email: 'delete@example.com' })
    await users.destroy(user.id)
    const found = await users.findById(user.id)
    expect(found).toBeNull()
  })
})

describe('find and findAll', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
      age: integer('age'),
    })

    db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT,
        age INTEGER
      )
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('find returns matching records', async () => {
    await users.create({ email: 'find1@test.com', name: 'Finder' })
    const results = await users.find({ name: 'Finder' })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].name).toBe('Finder')
  })

  it('findOne returns first match or null', async () => {
    await users.create({ email: 'one@test.com', name: 'OneTest' })
    const found = await users.findOne({ name: 'OneTest' })
    expect(found).not.toBeNull()
    expect(found.name).toBe('OneTest')

    const notFound = await users.findOne({ name: 'NoSuchName_' + Date.now() })
    expect(notFound).toBeNull()
  })

  it('findByIdIn returns multiple records', async () => {
    const u1 = await users.create({ email: 'in1@test.com' })
    const u2 = await users.create({ email: 'in2@test.com' })
    const results = await users.findByIdIn([u1.id, u2.id])
    expect(results).toHaveLength(2)
  })

  it('findByIdIn with empty array returns empty', async () => {
    const results = await users.findByIdIn([])
    expect(results).toEqual([])
  })

  it('findAll supports limit', async () => {
    await users.create({ email: 'l1@test.com' })
    await users.create({ email: 'l2@test.com' })
    await users.create({ email: 'l3@test.com' })
    const results = await users.findAll({ limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('findAll supports multi-column orderBy', async () => {
    await users.create({ email: 'a@test.com', name: 'Alice', age: 30 })
    await users.create({ email: 'b@test.com', name: 'Alice', age: 25 })
    await users.create({ email: 'c@test.com', name: 'Bob', age: 40 })

    const results = await users.findAll({
      orderBy: [
        { column: 'name', direction: 'asc' },
        { column: 'age', direction: 'desc' },
      ],
    })

    expect(results).toHaveLength(3)
    // Primary: name asc → Alice, Alice, Bob
    // Tiebreak: age desc → Alice(30), Alice(25), Bob(40)
    expect(results[0].name).toBe('Alice')
    expect(results[0].age).toBe(30)
    expect(results[1].name).toBe('Alice')
    expect(results[1].age).toBe(25)
    expect(results[2].name).toBe('Bob')
  })
})

describe('ref', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('returns the primary key of a matching record', async () => {
    const user = await users.create({ email: 'ref@test.com', name: 'RefTest' })
    const pk = await users.ref({ email: 'ref@test.com' })
    expect(pk).toBe(user.id)
  })

  it('throws StoreError when no record matches', async () => {
    await expect(
      users.ref({ email: 'nonexistent_' + Date.now() + '@test.com' })
    ).rejects.toThrow(StoreError)
  })
})

describe('destroyAll', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('deletes matching records and returns count', async () => {
    await users.create({ email: 'da1@test.com', name: 'DestroyAll' })
    await users.create({ email: 'da2@test.com', name: 'DestroyAll' })
    const count = await users.destroyAll({ name: 'DestroyAll' })
    expect(count).toBeGreaterThanOrEqual(2)
  })

  it('throws StoreError with empty filters', async () => {
    await expect(users.destroyAll({})).rejects.toThrow(StoreError)
  })
})

describe('prep pipeline integration', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: {
        email: {
          required: true,
          transform: (v) => (v as string).trim().toLowerCase(),
        },
      },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('applies transforms on create', async () => {
    const user = await users.create({ email: '  UPPER@CASE.COM  ' })
    expect(user.email).toBe('upper@case.com')
  })

  it('enforces required fields on create', async () => {
    await expect(users.create({ name: 'NoEmail' })).rejects.toThrow()
  })

  it('bypasses prep with skipPrep: true', async () => {
    const user = await users.create(
      { id: 'custom-id', email: 'skipPrep@test.com' },
      { skipPrep: true }
    )
    expect(user.id).toBe('custom-id')
  })
})

describe('custom queries', () => {
  it('receives ctx with original CRUD methods', async () => {
    const db = createDb()

    const itemsTable = sqliteTable('items', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      label: text('label').notNull(),
    })

    db.run(sql`
      CREATE TABLE items (id TEXT PRIMARY KEY, label TEXT NOT NULL)
    `)

    attachStoriumMeta(itemsTable, {
      columns: { label: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    const items = createRepository(itemsTable as any, {
      findByLabel: (ctx: any) => async (label: string) =>
        ctx.findOne({ label }),
    })

    const item = await items.create({ label: 'Widget' })
    const found = await items.findByLabel('Widget')
    expect(found).not.toBeNull()
    expect(found.id).toBe(item.id)
  })
})

describe('composite primary keys', () => {
  let db: any
  let memberships: any

  beforeEach(() => {
    db = createDb()

    const membershipsTable = sqliteTable('memberships', {
      user_id: text('user_id').notNull(),
      group_id: text('group_id').notNull(),
      role: text('role'),
    })

    db.run(sql`
      CREATE TABLE memberships (
        user_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        role TEXT,
        PRIMARY KEY (user_id, group_id)
      )
    `)

    // For composite PK tables, both columns need to be marked appropriately.
    // Since Drizzle doesn't mark composite PKs via .primaryKey() on individual
    // columns (that's done via primaryKey() table constraint), the detection
    // falls back to 'id' which doesn't exist, so we rely on Drizzle's table-level
    // composite PK definition or manual override.
    // The attachStoriumMeta will detect PK from Drizzle column metadata.
    attachStoriumMeta(membershipsTable, {
      columns: {
        user_id: { required: true },
        group_id: { required: true },
      },
    })

    // Since SQLite composite PKs aren't detected via column.primary,
    // manually set the PK on storium meta if needed.
    const meta = (membershipsTable as any).storium
    if (!meta.primaryKey || meta.primaryKey === 'id') {
      // Manually override for composite PK
      Object.defineProperty(membershipsTable, 'storium', {
        value: { ...meta, primaryKey: ['user_id', 'group_id'] },
        enumerable: false,
        configurable: true,
        writable: false,
      })
    }

    const createRepository = createCreateRepository(db, {}, 'memory')
    memberships = createRepository(membershipsTable as any)
  })

  it('creates a record with composite PK', async () => {
    const record = await memberships.create(
      { user_id: 'u1', group_id: 'g1', role: 'admin' },
      { skipPrep: true }
    )
    expect(record.user_id).toBe('u1')
    expect(record.group_id).toBe('g1')
    expect(record.role).toBe('admin')
  })

  it('findById with composite PK array', async () => {
    await memberships.create(
      { user_id: 'u1', group_id: 'g1', role: 'admin' },
      { skipPrep: true }
    )
    const found = await memberships.findById(['u1', 'g1'])
    expect(found).not.toBeNull()
    expect(found.role).toBe('admin')
  })

  it('findById returns null for non-existent composite PK', async () => {
    const found = await memberships.findById(['u1', 'nonexistent'])
    expect(found).toBeNull()
  })

  it('update with composite PK', async () => {
    await memberships.create(
      { user_id: 'u1', group_id: 'g1', role: 'admin' },
      { skipPrep: true }
    )
    const updated = await memberships.update(
      ['u1', 'g1'],
      { role: 'member' }
    )
    expect(updated.role).toBe('member')
  })

  it('destroy with composite PK', async () => {
    await memberships.create(
      { user_id: 'u2', group_id: 'g2', role: 'viewer' },
      { skipPrep: true }
    )
    await memberships.destroy(['u2', 'g2'])
    const found = await memberships.findById(['u2', 'g2'])
    expect(found).toBeNull()
  })

  it('findByIdIn throws StoreError for composite PKs', async () => {
    await expect(memberships.findByIdIn(['u1'])).rejects.toThrow(StoreError)
  })

  it('ref returns composite PK as array', async () => {
    await memberships.create(
      { user_id: 'u1', group_id: 'g1', role: 'admin' },
      { skipPrep: true }
    )
    const pk = await memberships.ref({ user_id: 'u1', group_id: 'g1' })
    expect(pk).toEqual(['u1', 'g1'])
  })
})

describe('where clause', () => {
  let db: any
  let users: any

  beforeEach(async () => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
      age: integer('age'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT, age INTEGER)
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)

    await users.create({ email: 'where1@test.com', name: 'WhereTest', age: 25 })
    await users.create({ email: 'where2@test.com', name: 'WhereTest', age: 30 })
    await users.create({ email: 'where3@test.com', name: 'WhereTest', age: 35 })
  })

  it('find supports where callback with Drizzle expressions', async () => {
    const results = await users.find(
      { name: 'WhereTest' },
      { where: (t: any) => gt(t.age, 28) }
    )
    expect(results.length).toBe(2)
    expect(results.every((r: any) => r.age > 28)).toBe(true)
  })

  it('find allows where-only (no equality filters)', async () => {
    const results = await users.find(
      {},
      { where: (t: any) => like(t.email, '%where%@test.com') }
    )
    expect(results.length).toBeGreaterThanOrEqual(3)
  })

  it('findAll supports where callback', async () => {
    const results = await users.findAll({
      where: (t: any) => gt(t.age, 30),
    })
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.every((r: any) => r.age > 30)).toBe(true)
  })

  it('destroyAll supports where callback', async () => {
    await users.create({ email: 'wd1@test.com', name: 'WhereDestroy', age: 99 })
    await users.create({ email: 'wd2@test.com', name: 'WhereDestroy', age: 99 })
    const count = await users.destroyAll(
      {},
      { where: (t: any) => gt(t.age, 90) }
    )
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

describe('count', () => {
  let db: any
  let users: any

  beforeEach(async () => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)

    await users.create({ email: 'count1@test.com', name: 'CountTest' })
    await users.create({ email: 'count2@test.com', name: 'CountTest' })
  })

  it('counts all rows when no filters', async () => {
    const total = await users.count()
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('counts rows matching equality filters', async () => {
    const n = await users.count({ name: 'CountTest' })
    expect(n).toBeGreaterThanOrEqual(2)
  })

  it('counts rows matching where callback', async () => {
    const n = await users.count({}, {
      where: (t: any) => like(t.email, '%count%@test.com'),
    })
    expect(n).toBeGreaterThanOrEqual(2)
  })
})

describe('exists', () => {
  let db: any
  let users: any

  beforeEach(async () => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)

    await users.create({ email: 'exists@test.com', name: 'ExistsTest' })
  })

  it('returns true when a matching row exists', async () => {
    const result = await users.exists({ name: 'ExistsTest' })
    expect(result).toBe(true)
  })

  it('returns false when no matching row exists', async () => {
    const result = await users.exists({ name: 'NoSuchName_' + Date.now() })
    expect(result).toBe(false)
  })

  it('supports where callback', async () => {
    const result = await users.exists({}, {
      where: (t: any) => like(t.email, '%exists@test.com'),
    })
    expect(result).toBe(true)
  })

  it('throws StoreError with no filters and no where', async () => {
    await expect(users.exists({})).rejects.toThrow(StoreError)
  })
})

describe('createMany', () => {
  let db: any
  let users: any

  beforeEach(() => {
    db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
      name: text('name'),
    })

    db.run(sql`
      CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT)
    `)

    attachStoriumMeta(usersTable, {
      columns: {
        email: {
          required: true,
          transform: (v) => (v as string).trim().toLowerCase(),
        },
      },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  it('inserts multiple rows and returns them', async () => {
    const rows = await users.createMany([
      { email: 'batch1@test.com', name: 'Batch' },
      { email: 'batch2@test.com', name: 'Batch' },
      { email: 'batch3@test.com', name: 'Batch' },
    ])
    expect(rows).toHaveLength(3)
    expect(rows.every((r: any) => r.id && r.name === 'Batch')).toBe(true)
  })

  it('returns empty array for empty input', async () => {
    const rows = await users.createMany([])
    expect(rows).toEqual([])
  })

  it('applies prep pipeline to each row', async () => {
    const rows = await users.createMany([
      { email: '  UPPER1@TEST.COM  ' },
      { email: '  UPPER2@TEST.COM  ' },
    ])
    expect(rows[0].email).toBe('upper1@test.com')
    expect(rows[1].email).toBe('upper2@test.com')
  })
})

describe('upsert', () => {
  let db: any
  let products: any

  beforeEach(() => {
    db = createDb()

    const productsTable = sqliteTable('products', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      sku: text('sku').notNull().unique(),
      name: text('name'),
      price: integer('price'),
    })

    db.run(sql`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT,
        price INTEGER
      )
    `)

    attachStoriumMeta(productsTable, {
      columns: { sku: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    products = createRepository(productsTable as any)
  })

  it('inserts a new row when no conflict', async () => {
    const row = await products.upsert({
      sku: 'SKU-001',
      name: 'Widget',
      price: 100,
    }, { conflictTarget: ['sku'] })

    expect(row.sku).toBe('SKU-001')
    expect(row.name).toBe('Widget')
    expect(row.price).toBe(100)
  })

  it('updates an existing row on conflict', async () => {
    await products.upsert({
      sku: 'SKU-001',
      name: 'Widget',
      price: 100,
    }, { conflictTarget: ['sku'] })

    const row = await products.upsert({
      sku: 'SKU-001',
      name: 'Updated Widget',
      price: 200,
    }, { conflictTarget: ['sku'] })

    expect(row.sku).toBe('SKU-001')
    expect(row.name).toBe('Updated Widget')
    expect(row.price).toBe(200)

    // Verify only one row exists
    const count = await products.count({ sku: 'SKU-001' })
    expect(count).toBe(1)
  })
})

describe('store name', () => {
  it('exposes the table name on the store', () => {
    const db = createDb()

    const usersTable = sqliteTable('users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      email: text('email').notNull(),
    })

    attachStoriumMeta(usersTable, {
      columns: { email: { required: true } },
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    const users = createRepository(usersTable as any)
    expect(users.name).toBe('users')
  })
})
