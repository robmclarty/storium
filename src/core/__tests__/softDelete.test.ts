import { describe, it, expect, beforeAll } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'

let db: any
let users: any

beforeAll(() => {
  db = storium.connect({ dialect: 'memory' })

  const usersTable = db.defineTable('sd_users').columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    name: { type: 'varchar', maxLength: 255, required: true },
    email: { type: 'varchar', maxLength: 255, required: true },
  }).softDelete()

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS sd_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    )
  `)

  users = db.defineStore(usersTable)
})

describe('soft delete', () => {
  describe('destroy() soft deletes', () => {
    it('marks the row as deleted instead of removing it', async () => {
      const user = await users.create({ name: 'Alice', email: 'alice@test.com' })
      await users.destroy(user.id)

      // Row should not appear in normal queries
      const found = await users.findById(user.id)
      expect(found).toBeNull()

      // Row should still exist in the database
      const stmt = db.drizzle.all(sql`SELECT * FROM sd_users WHERE id = ${user.id}`)
      expect(stmt).toHaveLength(1)
      expect(stmt[0].deleted_at).not.toBeNull()
    })
  })

  describe('read methods auto-filter deleted rows', () => {
    let activeUser: any

    beforeAll(async () => {
      activeUser = await users.create({ name: 'Bob', email: 'bob@test.com' })
      const deletedUser = await users.create({ name: 'Charlie', email: 'charlie@test.com' })
      await users.destroy(deletedUser.id)
    })

    it('find() excludes deleted rows', async () => {
      const result = await users.find({ name: 'Bob' })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Bob')

      const deleted = await users.find({ name: 'Charlie' })
      expect(deleted).toHaveLength(0)
    })

    it('findAll() excludes deleted rows', async () => {
      const all = await users.findAll()
      const names = all.map((r: any) => r.name)
      expect(names).toContain('Bob')
      expect(names).not.toContain('Charlie')
    })

    it('findOne() excludes deleted rows', async () => {
      const result = await users.findOne({ name: 'Charlie' })
      expect(result).toBeNull()
    })

    it('findById() excludes deleted rows', async () => {
      const result = await users.findById(activeUser.id)
      expect(result).not.toBeNull()
    })

    it('count() excludes deleted rows', async () => {
      const total = await users.count()
      const names = (await users.findAll()).map((r: any) => r.name)
      expect(total).toBe(names.length)
    })

    it('exists() excludes deleted rows', async () => {
      const exists = await users.exists({ name: 'Charlie' })
      expect(exists).toBe(false)

      const existsBob = await users.exists({ name: 'Bob' })
      expect(existsBob).toBe(true)
    })
  })

  describe('destroyAll() soft deletes matching rows', () => {
    it('sets deletedAt instead of deleting', async () => {
      const u1 = await users.create({ name: 'Temp1', email: 't1@test.com' })
      const u2 = await users.create({ name: 'Temp2', email: 't2@test.com' })

      const count = await users.destroyAll({ name: 'Temp1' })
      expect(count).toBe(1)

      const found = await users.find({ name: 'Temp1' })
      expect(found).toHaveLength(0)

      const found2 = await users.find({ name: 'Temp2' })
      expect(found2).toHaveLength(1)

      await users.destroy(u2.id)
    })
  })

  describe('restore()', () => {
    it('clears deletedAt and makes the row visible again', async () => {
      const user = await users.create({ name: 'Revived', email: 'revived@test.com' })
      await users.destroy(user.id)

      expect(await users.findById(user.id)).toBeNull()

      const restored = await users.restore(user.id)
      expect(restored).not.toBeNull()
      expect(restored.name).toBe('Revived')

      const found = await users.findById(user.id)
      expect(found).not.toBeNull()
    })
  })

  describe('forceDestroy()', () => {
    it('permanently deletes the row', async () => {
      const user = await users.create({ name: 'Gone', email: 'gone@test.com' })
      await users.forceDestroy(user.id)

      const rows = db.drizzle.all(sql`SELECT * FROM sd_users WHERE id = ${user.id}`)
      expect(rows).toHaveLength(0)
    })
  })

  describe('forceDestroyAll()', () => {
    it('permanently deletes matching rows', async () => {
      await users.create({ name: 'Perm1', email: 'p1@test.com' })
      await users.create({ name: 'Perm2', email: 'p2@test.com' })

      await users.forceDestroyAll({ name: 'Perm1' })

      const rows = db.drizzle.all(sql`SELECT * FROM sd_users WHERE name = 'Perm1'`)
      expect(rows).toHaveLength(0)

      const found = await users.find({ name: 'Perm2' })
      expect(found).toHaveLength(1)
    })
  })

  describe('findWithDeleted()', () => {
    it('returns all rows including soft-deleted ones', async () => {
      const all = await users.findWithDeleted()
      expect(all.length).toBeGreaterThan(0)
    })

    it('supports filters', async () => {
      const user = await users.create({ name: 'FilterTest', email: 'ft@test.com' })
      await users.destroy(user.id)

      const result = await users.findWithDeleted({ name: 'FilterTest' })
      expect(result).toHaveLength(1)
    })
  })
})
