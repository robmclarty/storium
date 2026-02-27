/**
 * Basic example — the simplest path to a working store.
 *
 * Demonstrates:
 *   - db.defineTable() + db.defineStore() — two-step schema + store creation
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

// --- Setup ---

const db = storium.connect({ dialect: 'memory' })

const usersTable = db.defineTable('users', {
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

db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT
  )
`)

const users = db.defineStore(usersTable)

// --- CRUD ---

console.log('=== CRUD ===')

const alice = await users.create({ email: '  Alice@Example.COM  ', name: 'Alice' })
const found = await users.findById(alice.id)
const updated = await users.update(alice.id, { name: 'Alice B.' })
const bob = await users.create({ email: 'bob@example.com', name: 'Bob' })
const byEmail = await users.findOne({ email: 'alice@example.com' })

console.log('Created:', alice)
console.log('Found by ID:', found)
console.log('Updated:', updated)
console.log('Found by email:', byEmail)

await users.destroy(bob.id)
const remaining = await users.findAll()
console.log('After delete:', remaining)

// --- Validation ---

console.log('\n=== Validation ===')

const emptyEmail = { email: '', name: 'Bad' }
try {
  await users.create(emptyEmail)
} catch (err) {
  console.log('Empty email:', (err as Error).message)
}

const invalidEmail = { email: 'not-an-email', name: 'Bad' }
try {
  await users.create(invalidEmail)
} catch (err) {
  console.log('Invalid email:', (err as Error).message)
}

// --- Transactions ---

console.log('\n=== Transactions ===')

const txResult = await db.transaction(async (tx) => {
  const u1 = await users.create({ email: 'carol@example.com', name: 'Carol' }, { tx })
  const u2 = await users.create({ email: 'dave@example.com', name: 'Dave' }, { tx })
  return [u1, u2]
})

console.log('Created in transaction:', txResult.map((u: any) => u.name))

// --- Runtime schemas ---

console.log('\n=== Schemas ===')

const jsonSchema = users.schemas.insert.toJsonSchema()
const userInput = { email: 'valid@example.com' }
const validation = users.schemas.insert.tryValidate(userInput)

console.log('JSON Schema:', JSON.stringify(jsonSchema, null, 2))
console.log('Validation:', validation)

await db.disconnect()
