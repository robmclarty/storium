import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const widgetsTable = sqliteTable('widgets', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
})
