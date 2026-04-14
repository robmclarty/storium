import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, hasOne } from 'storium'
import type { TableDef } from '../../types'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const usersTable = sqliteTable('has_one_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const profilesTable = sqliteTable('has_one_profiles', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull(),
  bio: text('bio'),
  avatar: text('avatar'),
})

// Attach .storium metadata so hasOne can read it
defineStore(profilesTable)

let db: any
let users: any
let profiles: any

beforeAll(async () => {
  db = storium.connect({ dialect: 'memory' })

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
    ...hasOne(profilesTable as unknown as TableDef, 'user_id', { alias: 'profile' }),
  })
})

describe('hasOne', () => {
  /* QA-10065 */ it('[QA-10065] generates a find{Alias}For method', () => {
    expect(typeof users.findProfileFor).toBe('function')
  })

  /* QA-10066 */ it('[QA-10066] returns the related row', async () => {
    const user = await users.create({ id: 'u1', name: 'Alice' })
    await profiles.create({ id: 'pr1', user_id: user.id, bio: 'Hello', avatar: 'alice.png' })

    const result = await users.findProfileFor(user.id)
    expect(result).not.toBeNull()
    expect(result.bio).toBe('Hello')
    expect(result.avatar).toBe('alice.png')
  })

  /* QA-10067 */ it('[QA-10067] returns null when no related row exists', async () => {
    const user = await users.create({ id: 'u2', name: 'Bob' })
    const result = await users.findProfileFor(user.id)
    expect(result).toBeNull()
  })

  /* QA-10068 */ it('[QA-10068] returns null for a non-existent parent ID', async () => {
    const result = await users.findProfileFor('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })

  /* QA-10069 */ it('[QA-10069] respects select option', async () => {
    const profilesTable2 = sqliteTable('has_one_profiles', {
      id: text('id').primaryKey(),
      user_id: text('user_id').notNull(),
      bio: text('bio'),
      avatar: text('avatar'),
    })
    defineStore(profilesTable2)

    const usersTable2 = sqliteTable('has_one_users', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })

    const users2 = db.defineStore(usersTable2).queries({
      ...hasOne(profilesTable2 as unknown as TableDef, 'user_id', { alias: 'profile', select: ['bio'] }),
    })

    const [alice] = await users2.find({ name: 'Alice' })
    const result = await users2.findProfileFor(alice.id)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('bio')
    expect(result).not.toHaveProperty('avatar')
  })
})
