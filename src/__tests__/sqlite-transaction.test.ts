import { describe, it, expect } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

describe('SQLite transaction', () => {
  const setup = () => {
    const db = storium.connect({ dialect: 'memory' })

    db.drizzle.run(sql`
      CREATE TABLE items (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `)

    const itemsTable = sqliteTable('items', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })

    const items = db.defineStore(itemsTable)

    return { db, items }
  }

  /* QA-10026 */ it('[QA-10026] commits on success', async () => {
    const { db, items } = setup()

    await db.transaction(async (tx) => {
      await items.create({ id: '1', name: 'A' }, { tx })
      await items.create({ id: '2', name: 'B' }, { tx })
    })

    const all = await items.findAll()
    expect(all).toHaveLength(2)
    await db.disconnect()
  })

  /* QA-10027 */ it('[QA-10027] rolls back on error', async () => {
    const { db, items } = setup()

    await expect(
      db.transaction(async (tx) => {
        await items.create({ id: '1', name: 'A' }, { tx })
        throw new Error('abort')
      })
    ).rejects.toThrow('abort')

    const all = await items.findAll()
    expect(all).toHaveLength(0)
    await db.disconnect()
  })
})
