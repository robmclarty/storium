import { defineTable } from 'storium'

export const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, default: 'draft' },
  author_id: { type: 'uuid', mutable: true, required: true },
  // SQLite: arrays stored as JSON text under the hood
  tags: { type: 'array', items: 'text', mutable: true },
  // SQLite: jsonb maps to text(mode: 'json')
  metadata: { type: 'jsonb', mutable: true },
}, {
  timestamps: true,
  indexes: {
    author_status: { columns: ['author_id', 'status'] },
  },
})
