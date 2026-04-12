import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const postsTable = sqliteTable('posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').notNull(),
  author_id: text('author_id').notNull(),
})
