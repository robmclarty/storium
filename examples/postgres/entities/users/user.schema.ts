import { defineTable } from 'storium'

// Explicit dialect (curried) — schema files must be self-contained because
// drizzle-kit imports them at module level before any db connection exists.
const dt = defineTable('postgresql')

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
  metadata: { type: 'jsonb', mutable: true },
}, {
  timestamps: true,
  indexes: {
    email: { unique: true },
  },
})
