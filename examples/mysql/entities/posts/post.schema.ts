import { mysqlTable, text, varchar, json, index } from 'drizzle-orm/mysql-core'
import crypto from 'node:crypto'

export const postsTable = mysqlTable('posts', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  status: varchar('status', { length: 20 }).default('draft'),
  author_id: varchar('author_id', { length: 36 }).notNull(),
  // MySQL: arrays and jsonb stored as JSON
  tags: json('tags').$type<string[]>().default([]),
  metadata: json('metadata'),
}, (table) => [
  index('posts_author_status_idx').on(table.author_id, table.status),
])
