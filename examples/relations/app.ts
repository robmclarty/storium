/**
 * Relationship patterns — belongs-to, many-to-many, and raw JOINs.
 *
 * Demonstrates:
 *   - withBelongsTo: LEFT JOIN a related table (posts → authors)
 *   - withMembers: many-to-many via join table (posts ↔ tags)
 *   - Custom JOIN query: raw Drizzle escape hatch
 *   - ref(): FK resolution by filter (no manual ID tracking)
 *
 * No config files, no migrations, no external database — just connect
 * with `dialect: 'memory'` and start building.
 *
 * Run: npm start
 */

import { storium, withBelongsTo, withMembers } from 'storium'
import type { Ctx } from 'storium'
import { sql, eq } from 'drizzle-orm'

// --- Setup ---

const db = storium.connect({ dialect: 'memory' })

const authorsTable = db.defineTable('authors', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
})

const postsTable = db.defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, required: true },
  author_id: { type: 'uuid', mutable: true, required: true },
})

const tagsTable = db.defineTable('tags', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: { type: 'varchar', maxLength: 100, mutable: true, required: true },
})

const postTagsTable = db.defineTable('post_tags', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  post_id: { type: 'uuid', mutable: true, required: true },
  tag_id: { type: 'uuid', mutable: true, required: true },
})

// Normally this would be handled by a migration, but for the sake of simplicity:
db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  )
`)

db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES authors(id)
  )
`)

db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  )
`)

db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS post_tags (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id),
    tag_id TEXT NOT NULL REFERENCES tags(id)
  )
`)

// --- Stores ---

const authors = db.defineStore(authorsTable)

const posts = db.defineStore(postsTable, {
  // Belongs-to: generates findWithAuthor(postId) via LEFT JOIN
  ...withBelongsTo(authorsTable, 'author_id', {
    alias: 'author',
    select: ['name', 'email'],
  }),
  // Many-to-many: generates addMember, removeMember, getMembers, isMember, getMemberCount
  ...withMembers(postTagsTable, 'post_id', 'tag_id'),
})

const tags = db.defineStore(tagsTable, {
  // Custom JOIN: raw Drizzle escape hatch for queries the helpers don't cover
  findPostsByTag: (ctx: Ctx) => async (tagName: string) =>
    ctx.drizzle
      .select({
        id: postsTable.id,
        title: postsTable.title,
        status: postsTable.status,
      })
      .from(tagsTable)
      .innerJoin(postTagsTable, eq(postTagsTable.tag_id, tagsTable.id))
      .innerJoin(postsTable, eq(postsTable.id, postTagsTable.post_id))
      .where(eq(tagsTable.name, tagName)),
})

// --- Seed data ---

console.log('=== Seed Data ===')

const alice = await authors.create({ name: 'Alice', email: 'alice@example.com' })
const bob = await authors.create({ name: 'Bob', email: 'bob@example.com' })

// ref() resolves the FK by filter — no manual ID tracking needed.
// The prep pipeline auto-resolves the Promise before insert.
const post1 = await posts.create({
  title: 'Getting Started',
  body: 'A guide for beginners...',
  status: 'published',
  author_id: authors.ref({ email: 'alice@example.com' }),
})
const post2 = await posts.create({
  title: 'Advanced Patterns',
  body: 'Deep dive into relationships...',
  status: 'published',
  author_id: alice.id,
})
const post3 = await posts.create({
  title: 'Draft Ideas',
  body: 'Work in progress...',
  status: 'draft',
  author_id: bob.id,
})

const tagJS = await tags.create({ name: 'javascript' })
const tagDB = await tags.create({ name: 'databases' })
const tagTutorial = await tags.create({ name: 'tutorial' })

console.log('Authors:', [alice.name, bob.name])
console.log('Posts:', [post1.title, post2.title, post3.title])
console.log('Tags:', [tagJS.name, tagDB.name, tagTutorial.name])

// --- Belongs-to: findWithAuthor ---

console.log('\n=== Belongs-to ===')

const postWithAuthor = await posts.findWithAuthor(post1.id)
console.log('Post with author:', {
  title: postWithAuthor.title,
  author_name: postWithAuthor.author_name,
  author_email: postWithAuthor.author_email,
})

const postWithAuthor2 = await posts.findWithAuthor(post3.id)
console.log('Another post:', {
  title: postWithAuthor2.title,
  author_name: postWithAuthor2.author_name,
})

// --- Many-to-many: tags via withMembers ---

console.log('\n=== Many-to-Many ===')

// Tag posts (addMember: collectionId, memberId)
await posts.addMember(post1.id, tagJS.id)
await posts.addMember(post1.id, tagDB.id)
await posts.addMember(post1.id, tagTutorial.id)
await posts.addMember(post2.id, tagJS.id)
await posts.addMember(post2.id, tagDB.id)

// Get tags for a post
const post1Tags = await posts.getMembers(post1.id)
console.log('Post 1 tag count:', post1Tags.length)

// Check membership
const hasJS = await posts.isMember(post1.id, tagJS.id)
const hasTutorial = await posts.isMember(post2.id, tagTutorial.id)
console.log('Post 1 has "javascript":', hasJS)
console.log('Post 2 has "tutorial":', hasTutorial)

// Count
const tagCount = await posts.getMemberCount(post1.id)
console.log('Post 1 tag count (via count):', tagCount)

// Remove a tag
await posts.removeMember(post1.id, tagTutorial.id)
const afterRemove = await posts.getMemberCount(post1.id)
console.log('After removing "tutorial":', afterRemove)

// --- Custom JOIN: find posts by tag name ---

console.log('\n=== Custom JOIN ===')

const jsPosts = await tags.findPostsByTag('javascript')
console.log('Posts tagged "javascript":', jsPosts.map((p: any) => p.title))

const dbPosts = await tags.findPostsByTag('databases')
console.log('Posts tagged "databases":', dbPosts.map((p: any) => p.title))

await db.disconnect()
