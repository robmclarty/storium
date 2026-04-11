import { describe, it, expect, beforeAll } from 'vitest'
import { storium, hasMany } from 'storium'
import { sql, like } from 'drizzle-orm'

let db: any
let authors: any
let posts: any

beforeAll(async () => {
  db = storium.connect({ dialect: 'memory' })

  const authorsTable = db.defineTable('authors').columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    name: { type: 'varchar', maxLength: 255, required: true },
  }).timestamps(false)

  const postsTable = db.defineTable('posts').columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    title: { type: 'varchar', maxLength: 255, required: true },
    author_id: { type: 'uuid', required: true },
  }).timestamps(false)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL
    )
  `)

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, author_id TEXT NOT NULL
    )
  `)

  posts = db.defineStore(postsTable)

  authors = db.defineStore(authorsTable).queries({
    ...hasMany(postsTable, 'author_id', { alias: 'posts' }),
  })

  const alice = await authors.create({ name: 'Alice' })
  await posts.create({ title: 'Post A', author_id: alice.id })
  await posts.create({ title: 'Post B', author_id: alice.id })
  await posts.create({ title: 'Post C', author_id: alice.id })
})

describe('hasMany', () => {
  it('generates a find{Alias}For method', () => {
    expect(typeof authors.findPostsFor).toBe('function')
  })

  it('returns related rows as a flat array', async () => {
    const [alice] = await authors.find({ name: 'Alice' })
    const result = await authors.findPostsFor(alice.id)
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty('title')
    expect(result[0]).toHaveProperty('id')
  })

  it('returns an empty array when no related rows exist', async () => {
    const result = await authors.findPostsFor('00000000-0000-0000-0000-000000000000')
    expect(result).toEqual([])
  })

  it('supports limit option', async () => {
    const [alice] = await authors.find({ name: 'Alice' })
    const result = await authors.findPostsFor(alice.id, { limit: 2 })
    expect(result).toHaveLength(2)
  })

  it('supports orderBy option', async () => {
    const [alice] = await authors.find({ name: 'Alice' })
    const result = await authors.findPostsFor(alice.id, {
      orderBy: { column: 'title', direction: 'asc' },
    })
    expect(result[0].title).toBe('Post A')
    expect(result[2].title).toBe('Post C')
  })

  it('supports where callback', async () => {
    const [alice] = await authors.find({ name: 'Alice' })
    const result = await authors.findPostsFor(alice.id, {
      where: (t: any) => like(t.title, '%A'),
    })
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Post A')
  })

  it('respects select option to limit returned columns', async () => {
    const authorsTable2 = db.defineTable('authors').columns({
      id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
      name: { type: 'varchar', maxLength: 255, required: true },
    }).timestamps(false)

    const postsTable2 = db.defineTable('posts').columns({
      id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
      title: { type: 'varchar', maxLength: 255, required: true },
      author_id: { type: 'uuid', required: true },
    }).timestamps(false)

    const authors2 = db.defineStore(authorsTable2).queries({
      ...hasMany(postsTable2, 'author_id', { alias: 'posts', select: ['title'] }),
    })

    const [alice] = await authors2.find({ name: 'Alice' })
    const result = await authors2.findPostsFor(alice.id)
    expect(result[0]).toHaveProperty('title')
    expect(result[0]).not.toHaveProperty('author_id')
  })
})
