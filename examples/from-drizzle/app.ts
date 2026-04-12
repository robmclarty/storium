/**
 * Bring your own Drizzle instance + Drizzle-native table definitions.
 *
 * This example shows two things:
 * 1. storium.fromDrizzle() wraps an existing Drizzle connection
 * 2. defineTable(drizzleTable) wraps an existing Drizzle table with
 *    Storium metadata — no DSL column definitions needed
 *
 * Use this when you have complex Drizzle schemas you don't want to
 * rewrite, or when you need full control over column types, defaults,
 * and constraints using Drizzle's native API. Storium's DSL is a
 * convenience layer — but sometimes you want the real thing.
 *
 * Note: Wrapped columns produce z.any() Zod schemas — Storium does
 * not attempt to reverse-engineer Drizzle column types. DB-level
 * constraints (NOT NULL, UNIQUE, etc.) still apply. For typed
 * validation, use defineTable('name').columns({...}) instead.
 *
 * Run: npm start
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { storium, defineTable, defineStore } from 'storium'

// --- 1. Define tables the Drizzle way ---
//
// Standard Drizzle table definitions — columns, indexes, defaults,
// everything you'd normally write. Storium doesn't interfere.

const articlesTable = sqliteTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body'),
  views: integer('views').notNull().default(0),
}, (table) => [
  uniqueIndex('articles_slug_unique').on(table.slug),
])

// --- 2. Wrap with Storium ---
//
// defineTable(drizzleTable) detects columns and primary key from
// the Drizzle table object. Use .access() to control which columns
// are readonly or hidden — the only chain method for wrapped tables.

const articles = defineTable(articlesTable).access({
  readonly: ['views'],
})

console.log('=== Table Metadata ===')
console.log('Name:', articles.storium.name)
console.log('Primary key:', articles.storium.primaryKey)
console.log('Selectable:', articles.storium.access.selectable)
console.log('Writable:', articles.storium.access.writable)
console.log('Readonly:', articles.storium.access.readonly)

// --- 3. Create Drizzle connection + Storium instance ---
//
// fromDrizzle() auto-detects the dialect from the Drizzle instance.
// No dialect string needed.

const client = createClient({ url: ':memory:' })
const myDrizzle = drizzle(client)

// drop it like it's hot
const db = storium.fromDrizzle(myDrizzle)

console.log('\n=== Setup ===')
console.log('Dialect auto-detected:', db.dialect)
console.log('Same Drizzle instance:', db.drizzle === myDrizzle)

// --- 4. Create store with custom queries ---

const articleStore = defineStore(articles).queries({
  findBySlug: (ctx) => async (slug: string) =>
    ctx.findOne({ slug }),
})

const { articles: store } = db.register({ articles: articleStore })

// Create the table (normally handled by migrations)
await db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    body TEXT,
    views INTEGER NOT NULL DEFAULT 0
  )
`)

// --- 5. Use Storium CRUD ---

console.log('\n=== CRUD via Storium ===')

const a1 = await store.create({
  id: crypto.randomUUID(),
  title: 'Hello World',
  slug: 'hello-world',
  body: 'First post.',
})
const a2 = await store.create({
  id: crypto.randomUUID(),
  title: 'From Drizzle',
  slug: 'from-drizzle',
  body: 'BYOD.',
})

console.log('Created:', a1.title, '→', a1.slug)
console.log('Created:', a2.title, '→', a2.slug)

const found = await store.findBySlug('hello-world')
console.log('Found by slug:', found?.title)

const byId = await store.findById(a1.id)
console.log('Found by id:', byId?.title)

// --- 6. Raw Drizzle alongside Storium ---
//
// db.drizzle is your original instance — use it for anything Storium
// doesn't cover. Both share the same connection.

console.log('\n=== Raw Drizzle alongside Storium ===')

// Bump views using raw SQL (views is readonly in Storium)
await db.drizzle.run(sql`UPDATE articles SET views = views + 1 WHERE id = ${a1.id}`)

const rawResult = await db.drizzle.all(sql`SELECT title, views FROM articles ORDER BY title`)
console.log('Raw SQL results:', rawResult)

const allArticles = await store.findAll()
console.log('Storium findAll:', allArticles.map((a: any) => `${a.title} (${a.views} views)`))

// --- Teardown ---
//
// fromDrizzle() does not own the connection, so db.disconnect() is a no-op.
// You close the connection yourself when you're done.

await db.disconnect()
client.close()
console.log('\nConnection closed by caller — Storium never owned it')
