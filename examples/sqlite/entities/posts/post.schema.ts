import { defineTable } from 'storium'

export const postsTable = defineTable('posts')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    title: { type: 'varchar', maxLength: 255, required: true },
    body: { type: 'text' },
    status: { type: 'varchar', maxLength: 20, default: 'draft' },
    author_id: { type: 'uuid', required: true },
    // SQLite: arrays stored as JSON text under the hood
    tags: { type: 'array', items: 'text', default: [] },
    // SQLite: jsonb maps to text(mode: 'json')
    metadata: { type: 'jsonb' },
  })
  .indexes({
    author_status: { columns: ['author_id', 'status'] },
  })
