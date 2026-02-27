import { describe, it, expect, beforeAll } from 'vitest'
import { storium, withBelongsTo } from 'storium'
import { sql } from 'drizzle-orm'

let db: any
let authors: any
let posts: any

beforeAll(() => {
  db = storium.connect({ dialect: 'memory' })

  const authorsTable = db.defineTable('authors', {
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    name: { type: 'varchar', maxLength: 255, mutable: true, required: true },
    email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  })

  const postsTable = db.defineTable('posts', {
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
    author_id: { type: 'uuid', mutable: true, required: true },
  })

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

  posts = db.defineStore(postsTable, {
    ...withBelongsTo(authorsTable, 'author_id', {
      alias: 'author',
      select: ['name', 'email'],
    }),
  })
})

describe('withBelongsTo', () => {
  it('generates a findWith{Alias} method', () => {
    expect(typeof posts.findWithAuthor).toBe('function')
  })

  it('returns the entity with inlined related fields', async () => {
    const author = await authors.create({ name: 'Alice', email: 'alice@test.com' })
    const post = await posts.create({ title: 'Hello', author_id: author.id })

    const result = await posts.findWithAuthor(post.id)
    expect(result).not.toBeNull()
    expect(result.title).toBe('Hello')
    expect(result.author_name).toBe('Alice')
    expect(result.author_email).toBe('alice@test.com')
  })

  it('returns null fields when the related entity does not exist', async () => {
    const post = await posts.create({
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
