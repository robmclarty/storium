/**
 * Bring your own Drizzle instance + Drizzle-native table definitions.
 *
 * This example shows two things:
 * 1. storium.fromDrizzle() wraps an existing Drizzle connection
 * 2. defineStore(drizzleTable, config?) adds Storium metadata (column
 *    annotations, access control) directly — no separate wrapping step
 *
 * Use this when you have complex Drizzle schemas you don't want to
 * rewrite, or when you need full control over column types, defaults,
 * and constraints using Drizzle's native API.
 *
 * Run: npm start
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { storium, defineStore } from 'storium'

// --- 1. Define tables the Drizzle way ---
//
// Standard Drizzle table definitions — columns, indexes, defaults,
// everything you'd normally write. Storium doesn't interfere.

const articlesTable = sqliteTable('articles', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  body: text('body'),
  views: integer('views').notNull().default(0),
}, (table) => [
  uniqueIndex('articles_slug_unique').on(table.slug),
])

// --- 2. Define store with annotations ---
//
// defineStore(drizzleTable, config?) detects columns and primary key
// from the Drizzle table. Use the config to annotate columns —
// readonly, hidden, required, transforms, validation, etc.

const articleStore = defineStore(articlesTable, {
  columns: {
    views: { readonly: true },
  },
}).queries({
  findBySlug: (ctx) => async (slug: string) =>
    ctx.findOne({ slug }),
})

console.log('=== Table Metadata ===')
console.log('Name:', articlesTable.storium.name)
console.log('Primary key:', articlesTable.storium.primaryKey)
console.log('Selectable:', articlesTable.storium.access.selectable)
console.log('Writable:', articlesTable.storium.access.writable)
console.log('Readonly:', articlesTable.storium.access.readonly)

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

// --- 4. Register the store ---

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
  title: 'Hello World',
  slug: 'hello-world',
  body: 'First post.',
})
const a2 = await store.create({
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
