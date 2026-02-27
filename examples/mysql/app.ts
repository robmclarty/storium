/**
 * MySQL example — full lifecycle with a real database
 *
 * Demonstrates:
 *  - Multi-file organization (entities/users/, entities/posts/)
 *  - Migration generation and application
 *  - Seed data
 *  - CRUD: create, find, update, destroy, findByIdIn, orderBy
 *  - writeOnly columns + includeWriteOnly for authentication
 *  - Custom queries (search, domain actions, MySQL-specific)
 *  - MySQL-specific features: JSON_CONTAINS(), JSON_EXTRACT(), LIKE
 *  - Transactions
 *  - Validation and runtime schemas
 *
 * Compare with the postgres/ and sqlite/ examples to see dialect differences
 * side by side. MySQL stores arrays and jsonb as native JSON columns.
 *
 * Requirements: Docker (for the temporary database)
 * Run: npm start
 */

import { ValidationError } from 'storium'
import { generate, migrate, seed } from 'storium/migrate'
import { startTemporaryDatabase } from './temporaryDatabase.js'
import { createDatabase } from './database.js'

// --- Setup: container, migrations, connection, seeds ---

const tempDb = await startTemporaryDatabase()
const { db, users, posts } = createDatabase(tempDb.config)

await generate()
await migrate(tempDb.config, db)
await seed(tempDb.config.seeds ?? './seeds', db)

// --- CRUD ---

console.log('\n=== CRUD ===')

const allUsers = await users.findAll()
const alice = await users.findByEmail('alice@example.com')
const updated = await users.update(alice.id, { bio: 'Updated bio!' })
const twoUsers = await users.findByIdIn([alice.id, allUsers[1].id])
const sorted = await users.findAll({ orderBy: { column: 'name', direction: 'desc' } })

console.log('All users:', allUsers.map(u => u.name))
console.log('Found Alice:', alice?.name, '— metadata:', alice?.metadata)
console.log('Updated bio:', updated.bio)
console.log('Batch lookup:', twoUsers.map(u => u.name))
console.log('Sorted desc:', sorted.map(u => u.name))

// --- writeOnly columns ---

console.log('\n=== writeOnly Columns ===')

// password_hash is writeOnly — excluded from normal queries
console.log('Normal findAll keys:', Object.keys(allUsers[0]))

// authenticate uses includeWriteOnly internally to read the hash
const authed = await users.authenticate('alice@example.com', 'hashed_alice_pw')
const badAuth = await users.authenticate('alice@example.com', 'wrong_password')

console.log('Good password:', authed ? 'success' : 'failed')
console.log('Bad password:', badAuth ? 'success' : 'failed')

// --- Custom queries ---

console.log('\n=== Custom Queries ===')

const searchResults = await users.search('bob')
const alicePosts = await posts.findByAuthor(alice.id)
const published = await posts.findPublished()

console.log('Search "bob":', searchResults.map(u => u.email))
console.log('Alice\'s posts:', alicePosts.map(p => p.title))
console.log('Published:', published.map(p => p.title))

// --- MySQL-specific: JSON queries ---

console.log('\n=== MySQL: JSON Queries ===')

// Tags stored as JSON array — queried with JSON_CONTAINS()
const tutorials = await posts.findByTag('tutorial')
console.log('Tagged "tutorial":', tutorials.map(p => p.title))

// Metadata stored as JSON object — queried with JSON_EXTRACT()
const featured = await posts.findByMetadata('featured', 'true')
console.log('Featured:', featured.map(p => p.title))

// --- Domain actions ---

console.log('\n=== Domain Actions ===')

const draft = await posts.findOne({ status: 'draft' })
if (!draft) throw new Error('Expected a draft post from seed data')

const pub = await posts.publish(draft.id)
console.log(`Published: "${pub.title}" is now ${pub.status}`)

const unpub = await posts.unpublish(draft.id)
console.log(`Unpublished: "${unpub.title}" is back to ${unpub.status}`)

// --- Validation ---

console.log('\n=== Validation ===')

const invalidUser = { email: '', name: 'Bad User' }
try {
  await users.create(invalidUser)
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Caught:', err.errors.map(e => `${e.field}: ${e.message}`))
  }
}

// --- Transactions ---

console.log('\n=== Transactions ===')

const { newUser, newPost } = await db.transaction(async (tx: any) => {
  const txUser = await users.create({ email: 'dave@example.com', name: 'Dave' }, { tx })
  const txPost = await posts.create({
    title: 'Atomic Post',
    body: 'Created in a transaction with its author.',
    status: 'published',
    author_id: txUser.id,
    tags: ['transaction', 'demo'],
  }, { tx })
  return { newUser: txUser, newPost: txPost }
})

console.log('Created user:', newUser.name, '+ post:', newPost.title)

// --- Destroy ---

console.log('\n=== Destroy ===')

await posts.destroy(newPost.id)

const remainingPosts = await posts.findAll()
console.log('Deleted post:', newPost.title, `— ${remainingPosts.length} remaining`)

// --- Runtime schemas ---

console.log('\n=== Schemas ===')

const insertSchema = users.schemas.insert.toJsonSchema()
const userInput = { email: 'test@example.com' }
const validation = users.schemas.insert.tryValidate(userInput)

console.log('Insert schema properties:', Object.keys(insertSchema.properties))
console.log('Validation result:', validation.success ? 'valid' : validation.errors)

// --- Teardown ---

await db.disconnect()
await tempDb.stop()
console.log('\nDone!')
