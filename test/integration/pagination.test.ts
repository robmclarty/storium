/**
 * withPagination integration tests across dialects.
 *
 * Exercises paginate() with correct data and meta, last-page handling,
 * empty results, and filtered pagination.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { defineStore, withPagination } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Pagination [${dialect}]`, () => {
    let ctx: TestDatabase
    let paginatedUsers: any

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

      const users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })

      paginatedUsers = withPagination(users, { pageSize: 3 })

      // Seed 7 users for pagination testing
      for (let i = 1; i <= 7; i++) {
        await users.create({ email: `page_user${i}@test.com`, name: 'PageGroup' })
      }
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    it('returns correct data and meta for first page', async () => {
      const result = await paginatedUsers.paginate(
        { name: 'PageGroup' },
        { page: 1 }
      )

      expect(result.data).toHaveLength(3)
      expect(result.meta.page).toBe(1)
      expect(result.meta.pageSize).toBe(3)
      expect(result.meta.total).toBe(7)
      expect(result.meta.totalPages).toBe(3)
    })

    it('last page has fewer items than pageSize', async () => {
      const result = await paginatedUsers.paginate(
        { name: 'PageGroup' },
        { page: 3 }
      )

      expect(result.data).toHaveLength(1) // 7 items, page 3 with pageSize 3 = 1 item
      expect(result.meta.page).toBe(3)
      expect(result.meta.total).toBe(7)
    })

    it('empty result set pagination', async () => {
      const result = await paginatedUsers.paginate(
        { name: 'NonexistentGroup' },
        { page: 1 }
      )

      expect(result.data).toHaveLength(0)
      expect(result.meta.total).toBe(0)
      expect(result.meta.totalPages).toBe(0)
    })

    it('paginate with custom pageSize override', async () => {
      const result = await paginatedUsers.paginate(
        { name: 'PageGroup' },
        { page: 1, pageSize: 5 }
      )

      expect(result.data).toHaveLength(5)
      expect(result.meta.pageSize).toBe(5)
      expect(result.meta.totalPages).toBe(2)
    })

    it('paginate with filters', async () => {
      const result = await paginatedUsers.paginate(
        { email: 'page_user1@test.com' },
        { page: 1 }
      )

      expect(result.data).toHaveLength(1)
      expect(result.data[0].email).toBe('page_user1@test.com')
      expect(result.meta.total).toBe(1)
      expect(result.meta.totalPages).toBe(1)
    })
  })
}
