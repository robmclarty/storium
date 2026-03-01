/**
 * Bring your own Drizzle instance.
 *
 * If you already have a Drizzle database — created with whatever driver
 * your runtime supports (@libsql/client, bun:sqlite, node-postgres,
 * mysql2, etc.) — storium.fromDrizzle() wraps it without creating a
 * second connection. Dialect is auto-detected from the Drizzle instance.
 *
 * This example uses @libsql/client (Turso/libSQL) — a completely
 * different SQLite driver than the better-sqlite3 that Storium uses
 * internally. This proves Storium is driver-agnostic: it only cares
 * about the Drizzle instance, not how you created it.
 *
 * This is useful when:
 *   - You manage the connection pool yourself
 *   - You use a runtime-specific driver (e.g. Bun's built-in SQLite)
 *   - You want Drizzle for raw queries AND Storium for structured CRUD
 *   - You're integrating Storium into an existing Drizzle codebase
 *
 * Note: Storium's CRUD methods (create, findById, etc.) work identically
 * regardless of driver. But when you use db.drizzle directly for raw
 * queries, the available methods depend on which Drizzle adapter you
 * used. For example:
 *   - libsql:         db.drizzle.run(), db.drizzle.all(), db.drizzle.get()
 *   - better-sqlite3:  db.drizzle.run(), db.drizzle.all(), db.drizzle.get()
 *   - node-postgres:   db.drizzle.execute()
 *   - mysql2:          db.drizzle.execute()
 * This is standard Drizzle behavior — Storium just passes through your
 * instance as-is.
 *
 * Run: npm start
 */

import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import { storium, defineTable, defineStore } from 'storium'

// --- 1. Create the Drizzle instance yourself ---
//
// Here we use @libsql/client with an in-memory database.
// In production you'd point this at a Turso URL or a local .db file.
// The point is: Storium doesn't care which driver you use.

const client = createClient({ url: ':memory:' })
const myDrizzle = drizzle(client)

// --- 2. Wrap it with Storium ---
//
// fromDrizzle() auto-detects the dialect from the Drizzle instance.
// No dialect string needed — Storium reads it from Drizzle's internals.
// You can also pass assertions here.

const db = storium.fromDrizzle(myDrizzle, {
  assertions: {
    is_slug: (v) => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
  },
})

console.log('=== Setup ===')
console.log('Dialect auto-detected:', db.dialect)
console.log('Same Drizzle instance:', db.drizzle === myDrizzle)

// --- 3. Define schema + store ---

const articlesTable = defineTable('sqlite')('articles').columns({
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, required: true },
  slug: {
    type: 'varchar',
    maxLength: 255,
    required: true,
    transform: (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-'),
    validate: (v, test) => {
      test(v, 'is_slug', 'Slug must be lowercase with hyphens')
    },
  },
  body: { type: 'text' },
}).timestamps(false)

const articleStore = defineStore(articlesTable).queries({
  findBySlug: (ctx) => async (slug: string) =>
    ctx.findOne({ slug }),
})

const { articles } = db.register({ articles: articleStore })

// Create the table (normally handled by migrations)
await db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    body TEXT
  )
`)

// --- 4. Use Storium CRUD ---

console.log('\n=== CRUD via Storium ===')

const a1 = await articles.create({ title: 'Hello World', slug: 'Hello World', body: 'First post.' })
const a2 = await articles.create({ title: 'From Drizzle', slug: 'From Drizzle', body: 'BYOD.' })

console.log('Created:', a1.title, '→', a1.slug)
console.log('Created:', a2.title, '→', a2.slug)

const found = await articles.findBySlug('hello-world')
console.log('Found by slug:', found?.title)

// --- 5. Use raw Drizzle alongside Storium ---
//
// db.drizzle is your original instance — use it for anything Storium
// doesn't cover. Both share the same connection, so they see the same data.

console.log('\n=== Raw Drizzle alongside Storium ===')

const rawResult = await db.drizzle.all(sql`SELECT COUNT(*) as count FROM articles`)
console.log('Raw SQL count:', rawResult[0])

const allArticles = await articles.findAll()
console.log('Storium findAll:', allArticles.map(a => a.title))

// --- 6. Validation still works ---

console.log('\n=== Validation ===')

try {
  await articles.create({ title: 'Bad Slug', slug: '!!!invalid!!!' })
} catch (err) {
  console.log('Rejected:', (err as Error).message)
}

// --- Teardown ---
//
// fromDrizzle() does not own the connection, so db.disconnect() is a no-op.
// You close the connection yourself when you're done.

await db.disconnect()
client.close()
console.log('\nConnection closed by caller — Storium never owned it')
