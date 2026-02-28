/**
 * Relationship patterns — belongs-to, many-to-many, and raw JOINs.
 *
 * Demonstrates:
 *   - withBelongsTo: LEFT JOIN a related table (posts → authors)
 *   - withMembers: many-to-many via join table (posts ↔ tags)
 *   - Custom JOIN query: raw Drizzle escape hatch
 *   - Composite primary keys on join tables
 *   - ref(): FK resolution by filter (no manual ID tracking)
 *   - Full migration lifecycle: generate → migrate → seed
 *
 * Run: npm start
 */

import { existsSync, unlinkSync, rmSync } from 'node:fs'
import { storium } from 'storium'
import { generate, migrate, seed, loadConfig } from 'storium/migrate'
import { authorStore } from './entities/authors/author.store.js'
import { postStore } from './entities/posts/post.store.js'
import { tagStore } from './entities/tags/tag.store.js'
import { postTagStore } from './entities/post-tags/post-tag.store.js'

// --- Clean slate ---

const dbPath = './data.db'
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })

// --- Migration lifecycle ---

await generate()
const config = await loadConfig()
const db = storium.connect(config)
await migrate(db)
await seed(db)

console.log('=== Setup ===')
console.log('Generated, migrated, and seeded.')

// --- Register stores ---

const { authors, posts, tags, postTags } = db.register({
  authors: authorStore,
  posts: postStore,
  tags: tagStore,
  postTags: postTagStore,
})

const allAuthors = await authors.findAll()
console.log('Authors:', allAuthors.map(a => a.name))

// --- Belongs-to: findWithAuthor ---

console.log('\n=== Belongs-to ===')

const allPosts = await posts.findAll()
const postWithAuthor = await posts.findWithAuthor(allPosts[0].id)
console.log('Post with author:', {
  title: postWithAuthor.title,
  author_name: postWithAuthor.author_name,
  author_email: postWithAuthor.author_email,
})

const postWithAuthor2 = await posts.findWithAuthor(allPosts[2].id)
console.log('Another post:', {
  title: postWithAuthor2.title,
  author_name: postWithAuthor2.author_name,
})

// --- Many-to-many: tags via withMembers ---

console.log('\n=== Many-to-Many ===')

const allTags = await tags.findAll()
const tagJS = allTags.find(t => t.name === 'javascript')
const tagDB = allTags.find(t => t.name === 'databases')
const tagTutorial = allTags.find(t => t.name === 'tutorial')

// Tag posts (addMember: collectionId, memberId)
await posts.addMember(allPosts[0].id, tagJS.id)
await posts.addMember(allPosts[0].id, tagDB.id)
await posts.addMember(allPosts[0].id, tagTutorial.id)
await posts.addMember(allPosts[1].id, tagJS.id)
await posts.addMember(allPosts[1].id, tagDB.id)

// Get tags for a post
const post1Tags = await posts.getMembers(allPosts[0].id)
console.log('Post 1 tag count:', post1Tags.length)

// Check membership
const hasJS = await posts.isMember(allPosts[0].id, tagJS.id)
const hasTutorial = await posts.isMember(allPosts[1].id, tagTutorial.id)
console.log('Post 1 has "javascript":', hasJS)
console.log('Post 2 has "tutorial":', hasTutorial)

// Count
const tagCount = await posts.getMemberCount(allPosts[0].id)
console.log('Post 1 tag count (via count):', tagCount)

// Remove a tag
await posts.removeMember(allPosts[0].id, tagTutorial.id)
const afterRemove = await posts.getMemberCount(allPosts[0].id)
console.log('After removing "tutorial":', afterRemove)

// --- Custom JOIN: find posts by tag name ---

console.log('\n=== Custom JOIN ===')

const jsPosts = await tags.findPostsByTag('javascript')
console.log('Posts tagged "javascript":', jsPosts.map((p: any) => p.title))

const dbPosts = await tags.findPostsByTag('databases')
console.log('Posts tagged "databases":', dbPosts.map((p: any) => p.title))

// --- Composite PK: direct join table operations ---

console.log('\n=== Composite PK ===')

// The post_tags join table uses primaryKey: ['post_id', 'tag_id'] — no synthetic id column.
// findById and destroy accept an array of values matching the PK column order.
const membership = await postTags.findById([allPosts[0].id, tagJS.id])
console.log('Find by composite PK:', membership ? 'found' : 'not found')

// Clean up a membership by composite PK
await postTags.destroy([allPosts[1].id, tagDB.id])
const afterDestroy = await posts.getMemberCount(allPosts[1].id)
console.log('Post 2 tags after composite destroy:', afterDestroy)

// --- Teardown ---

await db.disconnect()
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })
console.log('\nDone!')
