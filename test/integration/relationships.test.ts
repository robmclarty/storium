/**
 * Relationship mixin integration tests across dialects.
 *
 * Exercises belongsTo (LEFT JOIN), hasMany, and hasOne mixins
 * using users, posts, and profiles tables.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore, belongsTo, hasMany, hasOne } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Relationships [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any
    let posts: any
    let profiles: any
    let postsWithAuthor: any
    let usersWithPosts: any
    let usersWithProfile: any

    beforeAll(async () => {
      ctx = await createTestDatabase(dialect)
      const tables = getTables(dialect)
      const ddl = getDDL(dialect)

      for (const statement of Object.values(ddl)) {
        if (dialect === 'memory') {
          ctx.storium.drizzle.run(sql.raw(statement))
        } else {
          await ctx.storium.drizzle.execute(sql.raw(statement))
        }
      }

      // Base stores (needed for .storium metadata on tables)
      users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })
      posts = ctx.storium.defineStore(tables.posts, {
        columns: { title: { required: true }, author_id: { required: true } },
      })
      profiles = ctx.storium.defineStore(tables.profiles)

      // Stores with relationship mixins
      postsWithAuthor = ctx.storium.defineStore(tables.posts, {
        columns: { title: { required: true }, author_id: { required: true } },
      }).queries({
        ...belongsTo(tables.users, 'author_id', { alias: 'author' }),
      })

      usersWithPosts = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      }).queries({
        ...hasMany(tables.posts, 'author_id', { alias: 'posts' }),
      })

      usersWithProfile = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      }).queries({
        ...hasOne(tables.profiles, 'user_id', { alias: 'profile' }),
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    // ------------------------------------------------ belongsTo --

    it('belongsTo: LEFT JOIN returns entity with inlined related fields', async () => {
      const user = await users.create({ email: 'author1@test.com', name: 'Author1' })
      await posts.create({ title: 'Post1', author_id: user.id })

      const post = await postsWithAuthor.findOne({ title: 'Post1' })
      const result = await postsWithAuthor.findWithAuthor(post.id)

      expect(result).not.toBeNull()
      expect(result.title).toBe('Post1')
      expect(result.author_email).toBe('author1@test.com')
      expect(result.author_name).toBe('Author1')
    })

    it('belongsTo: returns null related fields when no relation exists', async () => {
      // Create a post with a non-existent author_id
      const fakeId = crypto.randomUUID()
      await posts.create({ title: 'Orphan', author_id: fakeId })

      const post = await postsWithAuthor.findOne({ title: 'Orphan' })
      const result = await postsWithAuthor.findWithAuthor(post.id)

      expect(result).not.toBeNull()
      expect(result.title).toBe('Orphan')
      expect(result.author_email).toBeNull()
    })

    // ------------------------------------------------ hasMany --

    it('hasMany: returns array of related rows', async () => {
      const user = await users.create({ email: 'hm_author@test.com', name: 'HMAuthor' })
      await posts.create({ title: 'HM Post 1', author_id: user.id })
      await posts.create({ title: 'HM Post 2', author_id: user.id })

      const results = await usersWithPosts.findPostsFor(user.id)
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.every((r: any) => r.author_id === user.id)).toBe(true)
    })

    it('hasMany: respects limit option', async () => {
      const user = await users.create({ email: 'hm_limit@test.com', name: 'HMLimit' })
      await posts.create({ title: 'Limit 1', author_id: user.id })
      await posts.create({ title: 'Limit 2', author_id: user.id })
      await posts.create({ title: 'Limit 3', author_id: user.id })

      const results = await usersWithPosts.findPostsFor(user.id, { limit: 2 })
      expect(results).toHaveLength(2)
    })

    it('hasMany: returns empty array when no related rows', async () => {
      const user = await users.create({ email: 'hm_empty@test.com', name: 'HMEmpty' })
      const results = await usersWithPosts.findPostsFor(user.id)
      expect(results).toEqual([])
    })

    // ------------------------------------------------ hasOne --

    it('hasOne: returns single related row', async () => {
      const user = await users.create({ email: 'ho_user@test.com', name: 'HOUser' })
      await profiles.create({ user_id: user.id, bio: 'Hello world' })

      const result = await usersWithProfile.findProfileFor(user.id)
      expect(result).not.toBeNull()
      expect(result.user_id).toBe(user.id)
      expect(result.bio).toBe('Hello world')
    })

    it('hasOne: returns null when no related row', async () => {
      const user = await users.create({ email: 'ho_null@test.com', name: 'HONull' })
      const result = await usersWithProfile.findProfileFor(user.id)
      expect(result).toBeNull()
    })
  })
}
