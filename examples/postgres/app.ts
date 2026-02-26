// PostgreSQL example — full lifecycle with Testcontainers
//
// Demonstrates:
//   - Multi-file organization (entities/users/, entities/posts/)
//   - Migration generation and application
//   - Seed data
//   - CRUD + custom queries
//   - Postgres-specific features: jsonb, text[], array containment, ILIKE
//   - Transactions
//
// Requirements: Docker (for Testcontainers)
// Run: npm start

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { generate, migrate, runSeeds } from 'storium/migrate'
import { createDatabase } from './database.js'

// --- Start PostgreSQL container ---

console.log('Starting PostgreSQL container...')
const container = await new PostgreSqlContainer('postgres:16-alpine').start()
const connectionUrl = container.getConnectionUri()
console.log('Container started.')

// Set DATABASE_URL so drizzle.config.ts can read it.
process.env.DATABASE_URL = connectionUrl

// Import config lazily — after DATABASE_URL is set, so the connection URL
// is resolved correctly. This is also how the CLI works: DATABASE_URL is
// set in the environment before `npx storium generate` is called.
const { default: config } = await import('./drizzle.config.js')

// --- Generate and apply migrations ---

console.log('\n=== Migrations ===')

const genResult = await generate(config)
console.log('generate:', genResult.message)

const migResult = await migrate(config)
console.log('migrate:', migResult.message)

// --- Connect and register stores ---

const { db, users, posts } = createDatabase(config)

// --- Seed data ---

console.log('\n=== Seeds ===')
const seedResult = await runSeeds(config.seeds ?? './seeds', db.drizzle)
console.log(seedResult.message)

// --- CRUD ---

console.log('\n=== CRUD ===')

const allUsers = await users.findAll()
console.log(`Found ${allUsers.length} users:`, allUsers.map((u: any) => u.name))

const alice = await users.findByEmail('alice@example.com')
console.log('Found Alice:', alice?.name, '— metadata:', alice?.metadata)

const updated = await users.update(alice.id, { bio: 'Updated bio!' })
console.log('Updated Alice bio:', updated.bio)

// --- Custom queries ---

console.log('\n=== Custom Queries ===')

const searchResults = await users.search('bob')
console.log('Search "bob":', searchResults.map((u: any) => u.email))

const alicePosts = await posts.findByAuthor(alice.id)
console.log(`Alice's posts:`, alicePosts.map((p: any) => p.title))

const published = await posts.findPublished()
console.log('Published posts:', published.map((p: any) => p.title))

// --- Postgres-specific: array containment ---

console.log('\n=== Postgres: Array Queries ===')

const tutorials = await posts.findByTag('tutorial')
console.log('Posts tagged "tutorial":', tutorials.map((p: any) => p.title))

// --- Postgres-specific: JSONB queries ---

console.log('\n=== Postgres: JSONB Queries ===')

const featured = await posts.findByMetadata('featured', 'true')
console.log('Featured posts:', featured.map((p: any) => p.title))

// --- Domain actions ---

console.log('\n=== Domain Actions ===')

const draft = await posts.findOne({ status: 'draft' })
console.log(`"${draft.title}" is ${draft.status}`)

const pub = await posts.publish(draft.id)
console.log(`Published: "${pub.title}" is now ${pub.status}`)

const unpub = await posts.unpublish(draft.id)
console.log(`Unpublished: "${unpub.title}" is back to ${unpub.status}`)

// --- Transactions ---

console.log('\n=== Transactions ===')

const txResult = await db.withTransaction(async (tx: any) => {
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
console.log('Transaction created post:', txResult.newPost.title)

const finalCount = await users.findAll()
console.log(`\nTotal users: ${finalCount.length}`)
const postCount = await posts.findAll()
console.log(`Total posts: ${postCount.length}`)

// --- Runtime schemas ---

console.log('\n=== Schemas ===')

const insertSchema = users.schemas.insert.toJsonSchema()
console.log('User insert schema properties:', Object.keys(insertSchema.properties))

const validation = users.schemas.insert.tryValidate({ email: 'test@example.com' })
console.log('Validation result:', validation.success ? 'valid' : validation.errors)

// --- Teardown ---

console.log('\n=== Teardown ===')
await db.disconnect()
console.log('Disconnected from database.')
await container.stop()
console.log('Container stopped. Done!')
