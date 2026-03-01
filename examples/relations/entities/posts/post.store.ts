import { defineStore, withBelongsTo, withMembers } from 'storium'
import { postsTable } from './post.schema.js'
import { authorsTable } from '../authors/author.schema.js'
import { postTagsTable } from '../post-tags/post-tag.schema.js'

export const postStore = defineStore(postsTable).queries({
  // Belongs-to: generates findWithAuthor(postId) via LEFT JOIN
  ...withBelongsTo(authorsTable, 'author_id', {
    alias: 'author',
    select: ['name', 'email'],
  }),
  // Many-to-many: generates addMember, removeMember, getMembers, isMember, getMemberCount
  ...withMembers(postTagsTable, 'post_id', 'tag_id'),
})
