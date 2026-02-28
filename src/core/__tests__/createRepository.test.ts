import { describe, it, expect, beforeAll } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'
import { StoreError } from '../errors'

let db: any
let users: any

beforeAll(() => {
  db = storium.connect({ dialect: 'memory' })

  const usersTable = db.defineTable('users', {
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    email: {
      type: 'varchar',
      maxLength: 255,
      mutable: true,
      required: true,
      transform: (v: string) => v.trim().toLowerCase(),
    },
    name: { type: 'varchar', maxLength: 255, mutable: true },
    age: { type: 'integer', mutable: true },
  }, { timestamps: false })

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      age INTEGER
    )
  `)

  users = db.defineStore(usersTable)
})

describe('CRUD operations', () => {
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
    const results = await users.findAll({ limit: 2 })
    expect(results.length).toBeLessThanOrEqual(2)
  })
})

describe('ref', () => {
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
  it('applies transforms on create', async () => {
    const user = await users.create({ email: '  UPPER@CASE.COM  ' })
    expect(user.email).toBe('upper@case.com')
  })

  it('enforces required fields on create', async () => {
    await expect(users.create({ name: 'NoEmail' })).rejects.toThrow()
  })

  it('bypasses prep with force: true', async () => {
    const user = await users.create(
      { id: 'custom-id', email: 'force@test.com' },
      { force: true }
    )
    expect(user.id).toBe('custom-id')
  })
})

describe('custom queries', () => {
  it('receives ctx with original CRUD methods', async () => {
    const table = db.defineTable('items', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      label: { type: 'varchar', maxLength: 255, mutable: true, required: true },
    }, { timestamps: false })

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL
      )
    `)

    const items = db.defineStore(table, {
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
  let memberships: any

  beforeAll(() => {
    const table = db.defineTable('memberships', {
      user_id: { type: 'uuid', required: true },
      group_id: { type: 'uuid', required: true },
      role: { type: 'varchar', maxLength: 50, mutable: true },
    }, {
      timestamps: false,
      primaryKey: ['user_id', 'group_id'],
    })

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS memberships (
        user_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        role TEXT,
        PRIMARY KEY (user_id, group_id)
      )
    `)

    memberships = db.defineStore(table)
  })

  it('creates a record with composite PK', async () => {
    const record = await memberships.create(
      { user_id: 'u1', group_id: 'g1', role: 'admin' },
      { force: true }
    )
    expect(record.user_id).toBe('u1')
    expect(record.group_id).toBe('g1')
    expect(record.role).toBe('admin')
  })

  it('findById with composite PK array', async () => {
    const found = await memberships.findById(['u1', 'g1'])
    expect(found).not.toBeNull()
    expect(found.role).toBe('admin')
  })

  it('findById returns null for non-existent composite PK', async () => {
    const found = await memberships.findById(['u1', 'nonexistent'])
    expect(found).toBeNull()
  })

  it('update with composite PK', async () => {
    const updated = await memberships.update(
      ['u1', 'g1'],
      { role: 'member' }
    )
    expect(updated.role).toBe('member')
  })

  it('destroy with composite PK', async () => {
    await memberships.create(
      { user_id: 'u2', group_id: 'g2', role: 'viewer' },
      { force: true }
    )
    await memberships.destroy(['u2', 'g2'])
    const found = await memberships.findById(['u2', 'g2'])
    expect(found).toBeNull()
  })

  it('findByIdIn throws StoreError for composite PKs', async () => {
    await expect(memberships.findByIdIn(['u1'])).rejects.toThrow(StoreError)
  })

  it('ref returns composite PK as array', async () => {
    const pk = await memberships.ref({ user_id: 'u1', group_id: 'g1' })
    expect(pk).toEqual(['u1', 'g1'])
  })
})
