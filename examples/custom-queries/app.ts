import { storium, defineTable, defineStore } from 'storium'
import { sql, eq, like, desc } from 'drizzle-orm'

// Custom queries let you extend stores with domain-specific operations.
// Each query receives a `ctx` object containing:
//
//   ctx.drizzle       — the raw Drizzle database instance
//   ctx.table         — the Drizzle table object
//   ctx.selectColumns — pre-built column map for SELECT
//   ctx.primaryKey    — PK column name
//   ctx.schemas       — runtime schemas
//   ctx.prep()        — the validation/transform pipeline
//   ctx.find, ctx.findOne, ctx.findById, ctx.create, ctx.update, ...
//
// Custom queries return a function — this lets ctx capture the original
// defaults, so even if you override `create`, ctx.create still refers
// to the built-in version.

// --- Define the schema ---

const articlesTable = defineTable('memory')('articles', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  slug: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, required: true },
  author_id: { type: 'uuid', mutable: true, required: true },
  view_count: { type: 'integer', mutable: true },
})

// --- Define the store with custom queries ---

const articleStore = defineStore(articlesTable, {
  // --- Compose with built-in CRUD ---
  // Use ctx.find / ctx.findOne to build domain-specific lookups.

  findBySlug: (ctx) => async (slug: string) =>
    ctx.findOne({ slug }),

  findByAuthor: (ctx) => async (authorId: string) =>
    ctx.find({ author_id: authorId }),

  findPublished: (ctx) => async () =>
    ctx.find({ status: 'published' }),

  // --- Override a default ---
  // Override `create` to auto-generate a slug from the title.
  // ctx.create still refers to the original built-in create,
  // so there's no infinite recursion.

  create: (ctx) => async (input: Record<string, any>, opts?: any) => {
    const slug = input.slug ?? input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    return ctx.create({ ...input, slug }, opts)
  },

  // --- Use the raw Drizzle escape hatch ---
  // For queries that go beyond the built-in CRUD, drop down to
  // ctx.drizzle and ctx.table for full Drizzle query builder access.

  search: (ctx) => async (term: string) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(like(ctx.table.title, `%${term}%`)),

  mostViewed: (ctx) => async (limit = 5) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(eq(ctx.table.status, 'published'))
      .orderBy(desc(ctx.table.view_count))
      .limit(limit),

  // --- Increment a counter ---
  // Raw SQL for atomic operations that don't map to CRUD.

  incrementViews: (ctx) => async (id: string) => {
    ctx.drizzle.run(
      sql`UPDATE articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`
    )
    return ctx.findById(id)
  },

  // --- Publish/unpublish as domain actions ---

  publish: (ctx) => async (id: string) =>
    ctx.update(id, { status: 'published' }),

  unpublish: (ctx) => async (id: string) =>
    ctx.update(id, { status: 'draft' }),
})

// --- Connect and register ---

const db = storium.connect({ dialect: 'memory' })
const { articles } = db.register({ articles: articleStore })

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

// --- Demo ---

console.log('=== Override: auto-slug from title ===')
const a1 = await articles.create({
  title: 'Getting Started with Storium',
  body: 'Storium is a lightweight storage abstraction...',
  status: 'published',
  author_id: 'user-1',
  view_count: 0,
})
console.log('Created with auto-slug:', a1.slug)
// => "getting-started-with-storium"

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

console.log('\n=== Custom lookup: findBySlug ===')
const found = await articles.findBySlug('getting-started-with-storium')
console.log('Found:', found?.title)

console.log('\n=== Custom lookup: findByAuthor ===')
const byAuthor = await articles.findByAuthor('user-1')
console.log('Articles by user-1:', byAuthor.map((a: any) => a.title))

console.log('\n=== Custom lookup: findPublished ===')
const published = await articles.findPublished()
console.log('Published:', published.map((a: any) => a.title))

console.log('\n=== Raw Drizzle: search ===')
const results = await articles.search('Storium')
console.log('Search "Storium":', results.map((a: any) => a.title))

console.log('\n=== Raw SQL: incrementViews ===')
await articles.incrementViews(a1.id)
await articles.incrementViews(a1.id)
await articles.incrementViews(a1.id)
await articles.incrementViews(a3.id)
const viewed = await articles.findById(a1.id)
console.log(`"${viewed.title}" has ${viewed.view_count} views`)

console.log('\n=== Raw Drizzle: mostViewed ===')
const top = await articles.mostViewed(2)
console.log('Most viewed:', top.map((a: any) => `${a.title} (${a.view_count} views)`))

console.log('\n=== Domain actions: publish/unpublish ===')
const pub = await articles.publish(a2.id)
console.log(`"${pub.title}" status: ${pub.status}`)
const unpub = await articles.unpublish(a2.id)
console.log(`"${unpub.title}" status: ${unpub.status}`)

console.log('\n=== Transactions ===')
await db.transaction(async (tx) => {
  await articles.create({
    title: 'Atomic Article 1',
    status: 'published',
    author_id: 'user-3',
    view_count: 0,
  }, { tx })
  await articles.create({
    title: 'Atomic Article 2',
    status: 'published',
    author_id: 'user-3',
    view_count: 0,
  }, { tx })
})
const all = await articles.findAll()
console.log(`Total articles after transaction: ${all.length}`)

await db.disconnect()
