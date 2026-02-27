import { defineTable } from 'storium'

export const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  body: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, required: true },
  author_id: { type: 'uuid', mutable: true, required: true },
})
