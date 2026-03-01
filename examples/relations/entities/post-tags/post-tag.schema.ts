import { defineTable } from 'storium'

export const postTagsTable = defineTable('post_tags')
  .columns({
    post_id: { type: 'uuid', required: true },
    tag_id: { type: 'uuid', required: true },
  })
  .primaryKey('post_id', 'tag_id')
