import { defineStore } from 'storium'
import { postTagsTable } from './post-tag.table.js'

export const postTagStore = defineStore(postTagsTable, {
  columns: {
    post_id: { required: true },
    tag_id: { required: true },
  },
})
