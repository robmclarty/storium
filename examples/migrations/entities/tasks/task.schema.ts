import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const tasksTable = sqliteTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('pending'),
  priority: integer('priority').default(0),
})
