import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import crypto from 'node:crypto'

export const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash'),
  name: text('name'),
  bio: text('bio'),
  // SQLite: no native jsonb — stored as JSON text
  metadata: text('metadata', { mode: 'json' }),
})
