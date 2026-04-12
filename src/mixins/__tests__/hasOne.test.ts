import { describe, it, expect, beforeAll } from 'vitest'
import { storium, hasOne } from 'storium'
import { sql } from 'drizzle-orm'

let db: any
let users: any
let profiles: any

beforeAll(async () => {
  db = storium.connect({ dialect: 'memory' })

  const usersTable = db.defineTable('has_one_users').columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    name: { type: 'varchar', maxLength: 255, required: true },
  }).timestamps(false)

  const profilesTable = db.defineTable('has_one_profiles').columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    user_id: { type: 'uuid', required: true },
    bio: { type: 'text' },
    avatar: { type: 'varchar', maxLength: 255 },
  }).timestamps(false)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS has_one_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL
    )
  `)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS has_one_profiles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, bio TEXT, avatar TEXT
    )
  `)

  profiles = db.defineStore(profilesTable)

  users = db.defineStore(usersTable).queries({
    ...hasOne(profilesTable, 'user_id', { alias: 'profile' }),
  })
})

describe('hasOne', () => {
  it('generates a find{Alias}For method', () => {
    expect(typeof users.findProfileFor).toBe('function')
  })

  it('returns the related row', async () => {
    const user = await users.create({ name: 'Alice' })
    await profiles.create({ user_id: user.id, bio: 'Hello', avatar: 'alice.png' })

    const result = await users.findProfileFor(user.id)
    expect(result).not.toBeNull()
    expect(result.bio).toBe('Hello')
    expect(result.avatar).toBe('alice.png')
  })

  it('returns null when no related row exists', async () => {
    const user = await users.create({ name: 'Bob' })
    const result = await users.findProfileFor(user.id)
    expect(result).toBeNull()
  })

  it('returns null for a non-existent parent ID', async () => {
    const result = await users.findProfileFor('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  it('respects select option', async () => {
    const profilesTable2 = db.defineTable('has_one_profiles').columns({
      id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
      user_id: { type: 'uuid', required: true },
      bio: { type: 'text' },
      avatar: { type: 'varchar', maxLength: 255 },
    }).timestamps(false)

    const usersTable2 = db.defineTable('has_one_users').columns({
      id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
      name: { type: 'varchar', maxLength: 255, required: true },
    }).timestamps(false)

    const users2 = db.defineStore(usersTable2).queries({
      ...hasOne(profilesTable2, 'user_id', { alias: 'profile', select: ['bio'] }),
    })

    const [alice] = await users2.find({ name: 'Alice' })
    const result = await users2.findProfileFor(alice.id)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('bio')
    expect(result).not.toHaveProperty('avatar')
  })
})
