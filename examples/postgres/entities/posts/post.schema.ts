import { defineTable } from 'storium'
import { text } from 'drizzle-orm/pg-core'

export const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, default: 'draft' },
  author_id: { type: 'uuid', mutable: true, required: true },
  // Postgres-specific: text[] array via raw escape hatch
  tags: { raw: () => text('tags').array().default([]), mutable: true },
  // Postgres-specific: jsonb is a first-class DSL type
  metadata: { type: 'jsonb', mutable: true },
}, {
  timestamps: true,
  indexes: {
    author_status: { columns: ['author_id', 'status'] },
  },
})
