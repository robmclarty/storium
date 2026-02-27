/**
 * Custom queries let you extend stores with domain-specific operations.
 * Each query receives a `ctx` object containing:
 *
 *   ctx.drizzle       — the raw Drizzle database instance
 *   ctx.table         — the Drizzle table object
 *   ctx.selectColumns — pre-built column map for SELECT
 *   ctx.primaryKey    — PK column name
 *   ctx.schemas       — runtime schemas
 *   ctx.prep()        — the validation/transform pipeline
 *   ctx.find, ctx.findOne, ctx.findById, ctx.create, ctx.update, ...
 *
 * Custom queries return a function — this lets ctx capture the original
 * defaults, so even if you override `create`, ctx.create still refers
 * to the built-in version.
 */

import { storium, defineTable, defineStore } from 'storium'
import type { Ctx } from 'storium'
import { sql, eq, like, desc } from 'drizzle-orm'

// --- Schema ---

const articlesTable = defineTable('memory')('articles', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  slug: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, required: true },
  author_id: { type: 'uuid', mutable: true, required: true },
  view_count: { type: 'integer', mutable: true },
})

// --- Store with custom queries ---

const articleStore = defineStore(articlesTable, {
  // Compose with built-in CRUD
  findBySlug: (ctx: Ctx) => async (slug: string) =>
    ctx.findOne({ slug }),

  findByAuthor: (ctx: Ctx) => async (authorId: string) =>
    ctx.find({ author_id: authorId }),

  findPublished: (ctx: Ctx) => async () =>
    ctx.find({ status: 'published' }),

  // Override create — auto-generate slug from title.
  // ctx.create still refers to the original, so no infinite recursion.
  create: (ctx: Ctx) => async (input: Record<string, any>, opts?: any) => {
    const slug = input.slug ?? input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    return ctx.create({ ...input, slug }, opts)
  },

  // Raw Drizzle escape hatch
  search: (ctx: Ctx) => async (term: string) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(like(ctx.table.title, `%${term}%`)),

  mostViewed: (ctx: Ctx) => async (limit = 5) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(eq(ctx.table.status, 'published'))
      .orderBy(desc(ctx.table.view_count))
      .limit(limit),

  // Raw SQL for atomic operations
  incrementViews: (ctx: Ctx) => async (id: string) => {
    ctx.drizzle.run(
      sql`UPDATE articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`
    )
    return ctx.findById(id)
  },

  // Domain actions
  publish: (ctx: Ctx) => async (id: string) =>
    ctx.update(id, { status: 'published' }),

  unpublish: (ctx: Ctx) => async (id: string) =>
    ctx.update(id, { status: 'draft' }),
})

// --- Connect and register ---

const db = storium.connect({ dialect: 'memory' })
const { articles } = db.register({ articles: articleStore })

// Normally this would be handled by a migration, but for the sake of simplicity:
db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    author_id TEXT NOT NULL,
    view_count INTEGER DEFAULT 0
  )
`)

// --- Override: auto-slug ---

console.log('=== Override: auto-slug from title ===')

const a1 = await articles.create({
  title: 'Getting Started with Storium',
  body: 'Storium is a lightweight storage abstraction...',
  status: 'published',
  author_id: 'user-1',
  view_count: 0,
})
const a2 = await articles.create({
  title: 'Advanced Custom Queries',
  body: 'Custom queries let you extend stores...',
  status: 'draft',
  author_id: 'user-1',
  view_count: 0,
})
const a3 = await articles.create({
  title: 'Storium vs Raw SQL',
  body: 'Why use an abstraction?',
  status: 'published',
  author_id: 'user-2',
  view_count: 0,
})

console.log('Auto-slug:', a1.slug)

// --- Custom lookups ---

console.log('\n=== Custom Lookups ===')

const found = await articles.findBySlug('getting-started-with-storium')
const byAuthor = await articles.findByAuthor('user-1')
const published = await articles.findPublished()

console.log('By slug:', found?.title)
console.log('By author:', byAuthor.map((a: any) => a.title))
console.log('Published:', published.map((a: any) => a.title))

// --- Raw Drizzle: search ---

console.log('\n=== Search ===')

const results = await articles.search('Storium')
console.log('Search "Storium":', results.map((a: any) => a.title))

// --- Raw SQL: increment views ---

console.log('\n=== Increment Views ===')

await articles.incrementViews(a1.id)
await articles.incrementViews(a1.id)
await articles.incrementViews(a1.id)
await articles.incrementViews(a3.id)

const top = await articles.mostViewed(2)
console.log('Most viewed:', top.map((a: any) => `${a.title} (${a.view_count} views)`))

// --- Domain actions ---

console.log('\n=== Domain Actions ===')

const pub = await articles.publish(a2.id)
const unpub = await articles.unpublish(a2.id)

console.log(`Published: "${pub.title}" → ${pub.status}`)
console.log(`Unpublished: "${unpub.title}" → ${unpub.status}`)

// --- Transactions ---

console.log('\n=== Transactions ===')

await db.transaction(async (tx) => {
  await articles.create({ title: 'Atomic Article 1', status: 'published', author_id: 'user-3', view_count: 0 }, { tx })
  await articles.create({ title: 'Atomic Article 2', status: 'published', author_id: 'user-3', view_count: 0 }, { tx })
})

const all = await articles.findAll()
console.log(`Total articles: ${all.length}`)

await db.disconnect()
