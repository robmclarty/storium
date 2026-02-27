import { defineTable } from 'storium'

// defineTable auto-detects the dialect from drizzle.config.ts
export const usersTable = defineTable('users', {
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
  metadata: { type: 'jsonb', mutable: true },
}, {
  timestamps: true,
  indexes: {
    email: { unique: true },
  },
})
