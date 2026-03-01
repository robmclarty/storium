import { defineTable } from 'storium'

export const postsTable = defineTable('posts')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v7' },
    title: { type: 'varchar', maxLength: 255, required: true },
    body: { type: 'text' },
    status: { type: 'varchar', maxLength: 20, default: 'draft' },
    author_id: { type: 'uuid', required: true },
    // Postgres: native text[] array; MySQL/SQLite: stored as JSON
    tags: { type: 'array', items: 'text', default: [] },
    metadata: { type: 'jsonb' },
  })
  .indexes({
    author_status: { columns: ['author_id', 'status'] },
  })
