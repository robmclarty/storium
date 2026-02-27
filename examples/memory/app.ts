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

// --- Define the schema once, reuse across connections ---

const productsTable = defineTable('memory')('products', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  price: { type: 'integer', mutable: true, required: true },
  in_stock: { type: 'boolean', mutable: true },
})

const productStore = defineStore(productsTable)

const setupDb = (db: StoriumInstance) => {
  const { products } = db.register({ products: productStore })

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

// --- Spin up two independent in-memory databases ---

const db1 = storium.connect({ dialect: 'memory' })
const db2 = storium.connect({ dialect: 'memory' })

// Each connection is completely isolated — they share no state.
const products1 = setupDb(db1)
const products2 = setupDb(db2)

// --- Populate db1 with some data ---

await products1.create({ name: 'Widget', price: 999, in_stock: true })
await products1.create({ name: 'Gadget', price: 2499, in_stock: false })
await products1.create({ name: 'Doohickey', price: 499, in_stock: true })

// --- db2 is empty — completely isolated ---

const db1Count = (await products1.findAll()).length
const db2Count = (await products2.findAll()).length

console.log(`db1 has ${db1Count} products, db2 has ${db2Count} products`)
// => db1 has 3 products, db2 has 0 products

// --- Use db2 as a scratch pad ---

const proto = await products2.create({ name: 'Prototype', price: 0, in_stock: false })
console.log('Prototype in db2:', proto)

// Update the prototype
const updated = await products2.update(proto.id, { price: 1299, in_stock: true })
console.log('Updated prototype:', updated)

// --- Tear down — data is gone ---

await db2.disconnect()
console.log('db2 disconnected — all data is gone, no cleanup needed')

// db1 is still alive
const stillThere = await products1.findAll()
console.log(`db1 still has ${stillThere.length} products:`, stillThere.map(p => p.name))

await db1.disconnect()
console.log('db1 disconnected — done')
