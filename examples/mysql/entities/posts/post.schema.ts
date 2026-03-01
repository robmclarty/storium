import { defineTable } from 'storium'

export const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, required: true },
  body: { type: 'text' },
  status: { type: 'varchar', maxLength: 20, default: 'draft' },
  author_id: { type: 'uuid', required: true },
  // MySQL: arrays and jsonb stored as JSON
  tags: { type: 'array', items: 'text', default: [] },
  metadata: { type: 'jsonb' },
}, {
  timestamps: true,
  indexes: {
    author_status: { columns: ['author_id', 'status'] },
  },
})
