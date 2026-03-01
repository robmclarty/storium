/**
 * The "memory" dialect creates an ephemeral SQLite database that lives
 * entirely in memory. Nothing touches disk. When you disconnect, the
 * data is gone. This makes it ideal for:
 *
 *   - Quick prototyping without setting up a database server
 *   - Unit/integration tests with fully isolated state
 *   - Trying out schema designs before committing to a real database
 */

import { storium, defineTable, defineStore } from 'storium'
import type { StoriumInstance } from 'storium'
import { sql } from 'drizzle-orm'

// --- Schema (defined once, reused across connections) ---

const productsTable = defineTable('memory')('products').columns({
  id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
  name: { type: 'varchar', maxLength: 255, required: true },
  price: { type: 'integer', required: true },
  inStock: { type: 'boolean' },
}).timestamps(false)

const productStore = defineStore(productsTable)

const setupDb = (db: StoriumInstance) => {
  const { products } = db.register({ products: productStore })

  // Normally this would be handled by a migration, but for the sake of simplicity:
  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      in_stock INTEGER DEFAULT 1
    )
  `)

  return products
}

// --- Two independent in-memory databases ---

const db1 = storium.connect({ dialect: 'memory' })
const db2 = storium.connect({ dialect: 'memory' })

const products1 = setupDb(db1)
const products2 = setupDb(db2)

// --- Populate db1 ---

await products1.create({ name: 'Widget', price: 999, inStock: true })
await products1.create({ name: 'Gadget', price: 2499, inStock: false })
await products1.create({ name: 'Doohickey', price: 499, inStock: true })

// --- Isolation: db2 sees nothing from db1 ---

console.log('=== Isolation ===')

const db1All = await products1.findAll()
const db2All = await products2.findAll()

console.log(`db1: ${db1All.length} products, db2: ${db2All.length} products`)

// --- Use db2 as a scratch pad ---

console.log('\n=== Scratch Pad ===')

const proto = await products2.create({ name: 'Prototype', price: 0, inStock: false })
const updated = await products2.update(proto.id, { price: 1299, inStock: true })

console.log('Created:', proto.name, '— updated price:', updated.price)

// --- Teardown ---

await db2.disconnect()
console.log('\ndb2 disconnected — all data gone, no cleanup needed')

const stillThere = await products1.findAll()
console.log(`db1 still has ${stillThere.length} products`)

await db1.disconnect()
