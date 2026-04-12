import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const tagsTable = sqliteTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull().unique(),
})
