import { pgTable, text, varchar, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import crypto from 'node:crypto'

export const usersTable = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull(),
  password_hash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 100 }),
  bio: text('bio'),
  metadata: jsonb('metadata'),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
])
