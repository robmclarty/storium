import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const authorsTable = sqliteTable('authors', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
})
