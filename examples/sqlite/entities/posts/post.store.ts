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
  findByAuthor,
  findPublished,
  publish,
  unpublish,
  findByTag,
  findByMetadata,
})
