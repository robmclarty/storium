import { pgTable, text, varchar, jsonb, index } from 'drizzle-orm/pg-core'
import crypto from 'node:crypto'

export const postsTable = pgTable('posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: varchar('title', { length: 255 }).notNull(),
  body: text('body'),
  status: varchar('status', { length: 20 }).default('draft'),
  author_id: text('author_id').notNull(),
  // Postgres: native text[] array
  tags: text('tags').array().default([]),
  metadata: jsonb('metadata'),
}, (table) => [
  index('posts_author_status_idx').on(table.author_id, table.status),
])
