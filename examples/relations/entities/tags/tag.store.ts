import { defineStore } from 'storium'
import { eq } from 'drizzle-orm'
import { tagsTable } from './tag.schema.js'
import { postTagsTable } from '../post-tags/post-tag.schema.js'
import { postsTable } from '../posts/post.schema.js'

export const tagStore = defineStore(tagsTable, {
  // Custom JOIN: raw Drizzle escape hatch for queries the helpers don't cover
  findPostsByTag: (ctx) => async (tagName: string) =>
    ctx.drizzle
      .select({
        id: postsTable.id,
        title: postsTable.title,
        status: postsTable.status,
      })
      .from(tagsTable)
      .innerJoin(postTagsTable, eq(postTagsTable.tag_id, tagsTable.id))
      .innerJoin(postsTable, eq(postsTable.id, postTagsTable.post_id))
      .where(eq(tagsTable.name, tagName)),
})
