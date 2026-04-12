import { defineStore } from 'storium'
import { postsTable } from './post.schema.js'
import {
  findByAuthor,
  findPublished,
  publish,
  unpublish,
  findByTag,
  findByMetadata,
} from './post.queries.js'

export const postStore = defineStore(postsTable, {
  columns: {
    title: { required: true },
    author_id: { required: true },
  },
}).queries({
  findByAuthor,
  findPublished,
  publish,
  unpublish,
  findByTag,
  findByMetadata,
})
