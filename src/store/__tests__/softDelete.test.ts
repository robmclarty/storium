import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { attachStoriumMeta } from '../define'
import { createCreateRepository } from '../repository'

describe('soft delete', () => {
  let db: any
  let users: any

  beforeEach(() => {
    const sqlite = new Database(':memory:')
    db = drizzle(sqlite)

    const usersTable = sqliteTable('sd_users', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      name: text('name').notNull(),
      email: text('email').notNull(),
      deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    })

    db.run(sql`
      CREATE TABLE IF NOT EXISTS sd_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        deleted_at INTEGER
      )
    `)

    attachStoriumMeta(usersTable, {
      columns: {
        name: { required: true },
        email: { required: true },
      },
      softDelete: true,
    })

    const createRepository = createCreateRepository(db, {}, 'memory')
    users = createRepository(usersTable as any)
  })

  describe('destroy() soft deletes', () => {
    /* QA-10284 */ it('[QA-10284] marks the row as deleted instead of removing it', async () => {
      const user = await users.create({ name: 'Alice', email: 'alice@test.com' })
      await users.destroy(user.id)

      // Row should not appear in normal queries
      const found = await users.findById(user.id)
      expect(found).toBeNull()

      // Row should still exist in the database
      const stmt = db.all(sql`SELECT * FROM sd_users WHERE id = ${user.id}`)
      expect(stmt).toHaveLength(1)
      expect(stmt[0].deleted_at).not.toBeNull()
    })
  })

  describe('read methods auto-filter deleted rows', () => {
    let activeUser: any

    beforeEach(async () => {
      activeUser = await users.create({ name: 'Bob', email: 'bob@test.com' })
      const deletedUser = await users.create({ name: 'Charlie', email: 'charlie@test.com' })
      await users.destroy(deletedUser.id)
    })

    /* QA-10285 */ it('[QA-10285] find() excludes deleted rows', async () => {
      const result = await users.find({ name: 'Bob' })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Bob')

      const deleted = await users.find({ name: 'Charlie' })
      expect(deleted).toHaveLength(0)
    })

    /* QA-10286 */ it('[QA-10286] findAll() excludes deleted rows', async () => {
      const all = await users.findAll()
      const names = all.map((r: any) => r.name)
      expect(names).toContain('Bob')
      expect(names).not.toContain('Charlie')
    })

    /* QA-10287 */ it('[QA-10287] findOne() excludes deleted rows', async () => {
      const result = await users.findOne({ name: 'Charlie' })
      expect(result).toBeNull()
    })

    /* QA-10288 */ it('[QA-10288] findById() excludes deleted rows', async () => {
      const result = await users.findById(activeUser.id)
      expect(result).not.toBeNull()
    })

    /* QA-10289 */ it('[QA-10289] count() excludes deleted rows', async () => {
      const total = await users.count()
      const names = (await users.findAll()).map((r: any) => r.name)
      expect(total).toBe(names.length)
    })

    /* QA-10290 */ it('[QA-10290] exists() excludes deleted rows', async () => {
      const exists = await users.exists({ name: 'Charlie' })
      expect(exists).toBe(false)

      const existsBob = await users.exists({ name: 'Bob' })
      expect(existsBob).toBe(true)
    })
  })

  describe('destroyAll() soft deletes matching rows', () => {
    /* QA-10291 */ it('[QA-10291] sets deletedAt instead of deleting', async () => {
      await users.create({ name: 'Temp1', email: 't1@test.com' })
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
    /* QA-10292 */ it('[QA-10292] clears deletedAt and makes the row visible again', async () => {
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
    /* QA-10293 */ it('[QA-10293] permanently deletes the row', async () => {
      const user = await users.create({ name: 'Gone', email: 'gone@test.com' })
      await users.forceDestroy(user.id)

      const rows = db.all(sql`SELECT * FROM sd_users WHERE id = ${user.id}`)
      expect(rows).toHaveLength(0)
    })
  })

  describe('forceDestroyAll()', () => {
    /* QA-10294 */ it('[QA-10294] permanently deletes matching rows', async () => {
      await users.create({ name: 'Perm1', email: 'p1@test.com' })
      await users.create({ name: 'Perm2', email: 'p2@test.com' })

      await users.forceDestroyAll({ name: 'Perm1' })

      const rows = db.all(sql`SELECT * FROM sd_users WHERE name = 'Perm1'`)
      expect(rows).toHaveLength(0)

      const found = await users.find({ name: 'Perm2' })
      expect(found).toHaveLength(1)
    })
  })

  describe('findWithDeleted()', () => {
    /* QA-10295 */ it('[QA-10295] returns all rows including soft-deleted ones', async () => {
      await users.create({ name: 'Active', email: 'active@test.com' })
      const deleted = await users.create({ name: 'Deleted', email: 'deleted@test.com' })
      await users.destroy(deleted.id)

      const all = await users.findWithDeleted()
      expect(all.length).toBeGreaterThan(0)
    })

    /* QA-10296 */ it('[QA-10296] supports filters', async () => {
      const user = await users.create({ name: 'FilterTest', email: 'ft@test.com' })
      await users.destroy(user.id)

      const result = await users.findWithDeleted({ name: 'FilterTest' })
      expect(result).toHaveLength(1)
    })
  })

  describe('ctx exposes soft-delete operations to custom queries', () => {
    /* QA-10299 */ it('[QA-10299] custom query can compose ctx.restore and ctx.findWithDeleted', async () => {
      const usersTable = sqliteTable('sd_ctx_users', {
        id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
        name: text('name').notNull(),
        email: text('email').notNull(),
        deletedAt: integer('deleted_at', { mode: 'timestamp' }),
      })

      db.run(sql`
        CREATE TABLE IF NOT EXISTS sd_ctx_users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          deleted_at INTEGER
        )
      `)

      attachStoriumMeta(usersTable, { softDelete: true })

      const createRepository = createCreateRepository(db, {}, 'memory')
      const store = createRepository(usersTable as any, {
        reviveByEmail: (ctx: any) => async (email: string) => {
          const [row] = await ctx.findWithDeleted({ email })
          if (!row) return null
          return ctx.restore(row.id)
        },
      })

      const user = await store.create({ name: 'CtxRevive', email: 'ctx@test.com' })
      await store.destroy(user.id)
      expect(await store.findById(user.id)).toBeNull()

      const revived = await store.reviveByEmail('ctx@test.com')
      expect(revived).not.toBeNull()
      expect(await store.findById(user.id)).not.toBeNull()
    })
  })
})
