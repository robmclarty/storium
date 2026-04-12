import { mysqlTable, text, varchar, json, uniqueIndex } from 'drizzle-orm/mysql-core'
import crypto from 'node:crypto'

export const usersTable = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull(),
  password_hash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 100 }),
  bio: text('bio'),
  metadata: json('metadata'),
}, (table) => [
  uniqueIndex('users_email_idx').on(table.email),
])
