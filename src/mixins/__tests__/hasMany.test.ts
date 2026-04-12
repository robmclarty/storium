import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, hasMany, StoreError } from 'storium'
import type { TableDef } from '../../types'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql, like } from 'drizzle-orm'

const authorsTable = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const postsTable = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author_id: text('author_id').notNull(),
})

// Attach .storium metadata so hasMany can read it
defineStore(postsTable)

let db: any
let authors: any
let posts: any

beforeAll(async () => {
  db = storium.connect({ dialect: 'memory' })

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
    ...hasMany(postsTable as unknown as TableDef, 'author_id', { alias: 'posts' }),
  })

  const alice = await authors.create({ id: 'alice-1', name: 'Alice' })
  await posts.create({ id: 'pa', title: 'Post A', author_id: alice.id })
  await posts.create({ id: 'pb', title: 'Post B', author_id: alice.id })
  await posts.create({ id: 'pc', title: 'Post C', author_id: alice.id })
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

  it('throws StoreError for unknown select column', () => {
    const badPostsTable = sqliteTable('posts', {
      id: text('id').primaryKey(),
      title: text('title').notNull(),
      author_id: text('author_id').notNull(),
    })
    defineStore(badPostsTable)

    const badAuthorsTable = sqliteTable('authors', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })

    const badAuthors = db.defineStore(badAuthorsTable).queries({
      ...hasMany(badPostsTable as unknown as TableDef, 'author_id', {
        alias: 'posts',
        select: ['title', 'nonexistent_col'],
      }),
    })

    expect(badAuthors.findPostsFor('alice-1')).rejects.toThrow(StoreError)
  })

  it('respects select option to limit returned columns', async () => {
    // Attach .storium with select restriction
    const postsTable2 = sqliteTable('posts', {
      id: text('id').primaryKey(),
      title: text('title').notNull(),
      author_id: text('author_id').notNull(),
    })
    defineStore(postsTable2)

    const authorsTable2 = sqliteTable('authors', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })

    const authors2 = db.defineStore(authorsTable2).queries({
      ...hasMany(postsTable2 as unknown as TableDef, 'author_id', { alias: 'posts', select: ['title'] }),
    })

    const [alice] = await authors2.find({ name: 'Alice' })
    const result = await authors2.findPostsFor(alice.id)
    expect(result[0]).toHaveProperty('title')
    expect(result[0]).not.toHaveProperty('author_id')
  })
})

describe('hasMany soft-delete filtering', () => {
  let db2: any
  let authors2: any
  let articles: any

  beforeAll(async () => {
    db2 = storium.connect({ dialect: 'memory' })

    const sdAuthorsTable = sqliteTable('sd_authors', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })

    const sdArticlesTable = sqliteTable('sd_articles', {
      id: text('id').primaryKey(),
      title: text('title').notNull(),
      author_id: text('author_id').notNull(),
      deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    })

    db2.drizzle.run(sql`CREATE TABLE sd_authors (id TEXT PRIMARY KEY, name TEXT NOT NULL)`)
    db2.drizzle.run(sql`CREATE TABLE sd_articles (id TEXT PRIMARY KEY, title TEXT NOT NULL, author_id TEXT NOT NULL, deleted_at INTEGER)`)

    defineStore(sdArticlesTable, { softDelete: true })

    articles = db2.defineStore(sdArticlesTable, { softDelete: true })

    authors2 = db2.defineStore(sdAuthorsTable).queries({
      ...hasMany(sdArticlesTable as unknown as TableDef, 'author_id', { alias: 'articles' }),
    })

    await authors2.create({ id: 'a1', name: 'Bob' })
    await articles.create({ id: 'art1', title: 'Live Article', author_id: 'a1' })
    await articles.create({ id: 'art2', title: 'Deleted Article', author_id: 'a1' })
    await articles.destroy('art2')
  })

  it('excludes soft-deleted related rows', async () => {
    const result = await authors2.findArticlesFor('a1')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Live Article')
  })
})
