import { defineStore } from 'storium'
import { postTagsTable } from './post-tag.schema.js'

export const postTagStore = defineStore(postTagsTable, {
  columns: {
    post_id: { required: true },
    tag_id: { required: true },
  },
})
