import { defineStore, belongsTo, withMembers } from 'storium'
import { postsTable } from './post.table.js'
import { authorsTable } from '../authors/author.table.js'
import { postTagsTable } from '../post-tags/post-tag.table.js'

export const postStore = defineStore(postsTable, {
  columns: {
    title: { required: true },
    status: { required: true },
    author_id: { required: true },
  },
}).queries({
  // Belongs-to: generates findWithAuthor(postId) via LEFT JOIN
  ...belongsTo(authorsTable, 'author_id', {
    alias: 'author',
    select: ['name', 'email'],
  }),
  // Many-to-many: generates addMember, removeMember, getMembers, isMember, getMemberCount
  ...withMembers(postTagsTable, 'post_id', 'tag_id'),
})
