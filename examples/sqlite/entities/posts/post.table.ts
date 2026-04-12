import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const postsTable = sqliteTable('posts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  body: text('body'),
  status: text('status').default('draft'),
  author_id: text('author_id').notNull(),
  // SQLite: arrays stored as JSON text under the hood
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  // SQLite: jsonb maps to text(mode: 'json')
  metadata: text('metadata', { mode: 'json' }),
}, (table) => [
  index('posts_author_status_idx').on(table.author_id, table.status),
])
