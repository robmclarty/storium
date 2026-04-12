import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, belongsTo } from 'storium'
import type { TableDef } from '../../types'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

const authorsTable = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
})

const postsTable = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author_id: text('author_id').notNull(),
})

// Attach .storium metadata to authorsTable so belongsTo can read it
defineStore(authorsTable)

let db: any
let authors: any
let posts: any

beforeAll(() => {
  db = storium.connect({ dialect: 'memory' })

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL
    )
  `)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, author_id TEXT NOT NULL
    )
  `)

  authors = db.defineStore(authorsTable)

  posts = db.defineStore(postsTable).queries({
    ...belongsTo(authorsTable as unknown as TableDef, 'author_id', {
      alias: 'author',
      select: ['name', 'email'],
    }),
  })
})

describe('belongsTo', () => {
  it('generates a findWith{Alias} method', () => {
    expect(typeof posts.findWithAuthor).toBe('function')
  })

  it('returns the entity with inlined related fields', async () => {
    const author = await authors.create({ id: 'a1', name: 'Alice', email: 'alice@test.com' })
    const post = await posts.create({ id: 'p1', title: 'Hello', author_id: author.id })

    const result = await posts.findWithAuthor(post.id)
    expect(result).not.toBeNull()
    expect(result.title).toBe('Hello')
    expect(result.author_name).toBe('Alice')
    expect(result.author_email).toBe('alice@test.com')
  })

  it('returns null fields when the related entity does not exist', async () => {
    const post = await posts.create({
      id: 'p2',
      title: 'Orphan',
      author_id: '00000000-0000-0000-0000-000000000000',
    })

    const result = await posts.findWithAuthor(post.id)
    expect(result).not.toBeNull()
    expect(result.title).toBe('Orphan')
    expect(result.author_name).toBeNull()
  })

  it('returns null when the entity itself does not exist', async () => {
    const result = await posts.findWithAuthor('00000000-0000-0000-0000-000000000000')
    expect(result).toBeNull()
  })
})
