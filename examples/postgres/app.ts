/**
 * PostgreSQL example — full lifecycle with a real database
 *
 * Demonstrates:
 *  - Multi-file organization (entities/users/, entities/posts/)
 *  - Migration generation and application
 *  - Seed data
 *  - CRUD + custom queries
 *  - Postgres-specific features: jsonb, text[], array containment, ILIKE
 *  - Transactions
 *  - Validation and runtime schemas
 *
 * If you just want to see storium in action, start with the basic/ or
 * custom-queries/ example first — they run in-memory with zero setup.
 *
 * Requirements: Docker (for the temporary database)
 * Run: npm start
 */

import { ValidationError } from 'storium'
import { generate, migrate, runSeeds } from 'storium/migrate'
import { startTemporaryDatabase } from './temporaryDatabase.js'
import { createDatabase } from './database.js'

// --- Start a temporary PostgreSQL container ---

const tempDb = await startTemporaryDatabase()

// --- Generate and apply migrations ---

console.log('\n=== Migrations ===')

const genResult = await generate(tempDb.config)
console.log('generate:', genResult.message)

const migResult = await migrate(tempDb.config)
console.log('migrate:', migResult.message)

// --- Connect and register stores ---

const { db, users, posts } = createDatabase(tempDb.config)

// --- Seed data ---

console.log('\n=== Seeds ===')
const seedResult = await runSeeds(tempDb.config.seeds ?? './seeds', db.drizzle)
console.log(seedResult.message)

// --- CRUD ---

console.log('\n=== CRUD ===')

const allUsers = await users.findAll()
console.log(`Found ${allUsers.length} users:`, allUsers.map(u => u.name))
// => Found 3 users: [ 'Alice', 'Bob', 'Carol' ]

const alice = await users.findByEmail('alice@example.com')
console.log('Found Alice:', alice?.name, '— metadata:', alice?.metadata)
// => Found Alice: Alice — metadata: { role: 'admin' }

const updated = await users.update(alice.id, { bio: 'Updated bio!' })
console.log('Updated Alice bio:', updated.bio)
// => Updated Alice bio: Updated bio!

// --- Custom queries ---

console.log('\n=== Custom Queries ===')

const searchResults = await users.search('bob')
console.log('Search "bob":', searchResults.map(u => u.email))
// => Search "bob": [ 'bob@example.com' ]

const alicePosts = await posts.findByAuthor(alice.id)
console.log(`Alice's posts:`, alicePosts.map(p => p.title))
// => Alice's posts: [ 'Getting Started with Storium', 'Advanced Queries' ]

const published = await posts.findPublished()
console.log('Published posts:', published.map(p => p.title))
// => Published posts: [ 'Getting Started...', 'Advanced Queries', 'PostgreSQL Tips' ]

// --- Postgres-specific: array containment ---

console.log('\n=== Postgres: Array Queries ===')

const tutorials = await posts.findByTag('tutorial')
console.log('Posts tagged "tutorial":', tutorials.map(p => p.title))
// => Posts tagged "tutorial": [ 'Getting Started with Storium', 'PostgreSQL Tips' ]

// --- Postgres-specific: JSONB queries ---

console.log('\n=== Postgres: JSONB Queries ===')

const featured = await posts.findByMetadata('featured', 'true')
console.log('Featured posts:', featured.map(p => p.title))
// => Featured posts: [ 'Getting Started with Storium', 'PostgreSQL Tips' ]

// --- Domain actions ---

console.log('\n=== Domain Actions ===')

const draft = await posts.findOne({ status: 'draft' })
if (!draft) throw new Error('Expected a draft post from seed data')

console.log(`"${draft.title}" is ${draft.status}`)
// => "Draft Post" is draft

const pub = await posts.publish(draft.id)
console.log(`Published: "${pub.title}" is now ${pub.status}`)
// => Published: "Draft Post" is now published

const unpub = await posts.unpublish(draft.id)
console.log(`Unpublished: "${unpub.title}" is back to ${unpub.status}`)
// => Unpublished: "Draft Post" is back to draft

// --- Validation ---

console.log('\n=== Validation ===')

try {
  await users.create({ email: '', name: 'Bad User' })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Validation caught:', err.errors.map(e => `${e.field}: ${e.message}`))
    // => Validation caught: [ 'email: ...' ]
  }
}

// --- Transactions ---

console.log('\n=== Transactions ===')

const txResult = await db.transaction(async (tx: any) => {
  const newUser = await users.create({ email: 'dave@example.com', name: 'Dave' }, { tx })
  const newPost = await posts.create({
    title: 'Atomic Post',
    body: 'Created in a transaction with its author.',
    status: 'published',
    author_id: newUser.id,
    tags: ['transaction', 'demo'],
  }, { tx })
  return { newUser, newPost }
})
console.log('Transaction created user:', txResult.newUser.name)
// => Transaction created user: Dave
console.log('Transaction created post:', txResult.newPost.title)
// => Transaction created post: Atomic Post

const finalCount = await users.findAll()
console.log(`\nTotal users: ${finalCount.length}`)
// => Total users: 4
const postCount = await posts.findAll()
console.log(`Total posts: ${postCount.length}`)
// => Total posts: 5

// --- Runtime schemas ---

console.log('\n=== Schemas ===')

const insertSchema = users.schemas.insert.toJsonSchema()
console.log('User insert schema properties:', Object.keys(insertSchema.properties))
// => User insert schema properties: [ 'email', 'name', 'bio', 'metadata' ]

const validation = users.schemas.insert.tryValidate({ email: 'test@example.com' })
console.log('Validation result:', validation.success ? 'valid' : validation.errors)
// => Validation result: valid

// --- Teardown ---

console.log('\n=== Teardown ===')
await db.disconnect()
console.log('Disconnected from database.')
await tempDb.stop()
console.log('Container stopped. Done!')
