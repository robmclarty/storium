import { defineTable } from 'storium'

export const postTagsTable = defineTable('post_tags', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  post_id: { type: 'uuid', mutable: true, required: true },
  tag_id: { type: 'uuid', mutable: true, required: true },
})
