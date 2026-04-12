import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'

export const postTagsTable = sqliteTable('post_tags', {
  post_id: text('post_id').notNull(),
  tag_id: text('tag_id').notNull(),
}, (table) => [
  primaryKey({ columns: [table.post_id, table.tag_id] }),
])
