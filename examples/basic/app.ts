/**
 * Basic example — the simplest path to a working store.
 *
 * Demonstrates:
 *   - db.defineStore() — define a schema and get a live store in one call
 *   - CRUD operations: create, findById, findAll, findOne, update, destroy
 *   - Validation: transforms, built-in assertions (is_email, not_empty)
 *   - Transactions: atomic multi-row inserts
 *   - Runtime schemas: toJsonSchema(), tryValidate()
 *
 * No config files, no migrations, no external database — just connect
 * with `dialect: 'memory'` and start building.
 *
 * Run: npm start
 */

import { storium } from 'storium'
import { sql } from 'drizzle-orm'

// Connect to an in-memory database.
const db = storium.connect({ dialect: 'memory' })

// Define a store in one call — schema + CRUD, ready to use.
const users = db.defineStore('users', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: {
    type: 'varchar',
    maxLength: 255,
    mutable: true,
    required: true,
    transform: (v: string) => v.trim().toLowerCase(),
    validate: (v, test) => {
      test(v, 'not_empty', 'Email cannot be empty')
      test(v, 'is_email', 'Must be a valid email address')
    },
  },
  name: { type: 'varchar', maxLength: 255, mutable: true },
}, {
  indexes: { email: { unique: true } },
})

// Create the table in the in-memory database.
// (In a real project you'd use `storium migrate` or `storium push` instead.)
db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT
  )
`)

// --- CRUD operations ---

// Create
const alice = await users.create({ email: '  Alice@Example.COM  ', name: 'Alice' })
console.log('Created:', alice)

// Read
const found = await users.findById(alice.id)
console.log('Found by ID:', found)

const all = await users.findAll()
console.log('All users:', all)

// Update
const updated = await users.update(alice.id, { name: 'Alice B.' })
console.log('Updated:', updated)

// Create another user
const bob = await users.create({ email: 'bob@example.com', name: 'Bob' })
console.log('Created:', bob)

// Find with filters
const byEmail = await users.findOne({ email: 'alice@example.com' })
console.log('Found by email:', byEmail)

// Delete
await users.destroy(bob.id)
const remaining = await users.findAll()
console.log('After delete:', remaining)

// --- Validation ---

try {
  await users.create({ email: '', name: 'Bad' })
} catch (err) {
  console.log('Validation error (empty email):', (err as Error).message)
}

try {
  await users.create({ email: 'not-an-email', name: 'Bad' })
} catch (err) {
  console.log('Validation error (invalid email):', (err as Error).message)
}

// --- Transactions ---

const txResult = await db.transaction(async (tx) => {
  const u1 = await users.create({ email: 'carol@example.com', name: 'Carol' }, { tx })
  const u2 = await users.create({ email: 'dave@example.com', name: 'Dave' }, { tx })
  return [u1, u2]
})
console.log('Created in transaction:', txResult)

// --- Runtime schemas ---

console.log('Insert schema (JSON):', JSON.stringify(users.schemas.insert.toJsonSchema(), null, 2))

const validation = users.schemas.insert.tryValidate({ email: 'valid@example.com' })
console.log('Schema validation result:', validation)

// Clean up
await db.disconnect()
