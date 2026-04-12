import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, belongsTo, StoreError } from 'storium'
import type { TableDef } from '../../types'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
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

  it('throws StoreError for unknown select column', () => {
    const badAuthorsTable = sqliteTable('authors', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
      email: text('email').notNull(),
    })
    defineStore(badAuthorsTable)

    const badPostsTable = sqliteTable('posts', {
      id: text('id').primaryKey(),
      title: text('title').notNull(),
      author_id: text('author_id').notNull(),
    })

    const badPosts = db.defineStore(badPostsTable).queries({
      ...belongsTo(badAuthorsTable as unknown as TableDef, 'author_id', {
        alias: 'author',
        select: ['name', 'nonexistent_col'],
      }),
    })

    expect(badPosts.findWithAuthor('p1')).rejects.toThrow(StoreError)
  })
})

describe('belongsTo soft-delete filtering', () => {
  let db2: any
  let items: any

  beforeAll(async () => {
    db2 = storium.connect({ dialect: 'memory' })

    const sdCategoriesTable = sqliteTable('sd_categories', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
      deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    })

    const sdItemsTable = sqliteTable('sd_items', {
      id: text('id').primaryKey(),
      title: text('title').notNull(),
      category_id: text('category_id').notNull(),
    })

    db2.drizzle.run(sql`CREATE TABLE sd_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, deleted_at INTEGER)`)
    db2.drizzle.run(sql`CREATE TABLE sd_items (id TEXT PRIMARY KEY, title TEXT NOT NULL, category_id TEXT NOT NULL)`)

    const categories = db2.defineStore(sdCategoriesTable, { softDelete: true })
    defineStore(sdCategoriesTable, { softDelete: true })

    items = db2.defineStore(sdItemsTable).queries({
      ...belongsTo(sdCategoriesTable as unknown as TableDef, 'category_id', {
        alias: 'category',
        select: ['name'],
      }),
    })

    await categories.create({ id: 'c1', name: 'Active Category' })
    await categories.create({ id: 'c2', name: 'Deleted Category' })
    await categories.destroy('c2')
    await items.create({ id: 'i1', title: 'Item with active cat', category_id: 'c1' })
    await items.create({ id: 'i2', title: 'Item with deleted cat', category_id: 'c2' })
  })

  it('returns null for related fields when the related row is soft-deleted', async () => {
    const result = await items.findWithCategory('i2')
    expect(result).not.toBeNull()
    expect(result.title).toBe('Item with deleted cat')
    expect(result.category_name).toBeNull()
  })

  it('returns related fields when the related row is not soft-deleted', async () => {
    const result = await items.findWithCategory('i1')
    expect(result).not.toBeNull()
    expect(result.category_name).toBe('Active Category')
  })
})
