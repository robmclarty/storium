import { defineTable } from 'storium'

export const postsTable = defineTable('posts').columns({
  id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
  title: { type: 'varchar', maxLength: 255, required: true },
  body: { type: 'text' },
  status: { type: 'varchar', maxLength: 20, required: true },
  author_id: { type: 'uuid', required: true },
})
