import { defineStore, belongsTo, withMembers } from 'storium'
import { postsTable } from './post.table.js'
import { authorStore } from '../authors/author.store.js'
import { postTagStore } from '../post-tags/post-tag.store.js'

export const postStore = defineStore(postsTable, {
  columns: {
    title: { required: true },
    status: { required: true },
    author_id: { required: true },
  },
}).queries({
  // Belongs-to: generates findWithAuthor(postId) via LEFT JOIN
  ...belongsTo(authorStore.table, 'author_id', {
    alias: 'author',
    select: ['name', 'email'],
  }),
  // Many-to-many: generates addMember, removeMember, getMembers, isMember, getMemberCount
  ...withMembers(postTagStore.table, 'post_id', 'tag_id'),
})
