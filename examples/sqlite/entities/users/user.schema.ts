import { defineTable } from 'storium'

const dt = defineTable('sqlite')

export const usersTable = dt('users', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: {
    type: 'varchar',
    maxLength: 255,
    mutable: true,
    required: true,
    transform: (v: string) => v.trim().toLowerCase(),
  },
  password_hash: { type: 'varchar', maxLength: 255, mutable: true, writeOnly: true },
  name: { type: 'varchar', maxLength: 100, mutable: true },
  bio: { type: 'text', mutable: true },
  // SQLite: no native jsonb — stored as JSON text
  metadata: { type: 'jsonb', mutable: true },
}, {
  timestamps: true,
  indexes: {
    email: { unique: true },
  },
})
