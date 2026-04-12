import { describe, it, expect, beforeAll } from 'vitest'
import { storium, defineStore, withPagination } from 'storium'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql, gt } from 'drizzle-orm'

const pgUsersTable = sqliteTable('pg_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  age: integer('age'),
})

let db: any
let users: any
let paginatedUsers: any

beforeAll(async () => {
  db = storium.connect({ dialect: 'memory' })

  db.drizzle.run(sql`
    CREATE TABLE IF NOT EXISTS pg_users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER
    )
  `)

  users = db.defineStore(pgUsersTable)
  paginatedUsers = withPagination(users)

  for (let i = 1; i <= 50; i++) {
    await users.create({ id: `user-${i}`, name: `User ${String(i).padStart(2, '0')}`, age: 20 + i })
  }
})

describe('withPagination', () => {
  it('adds a paginate method to the store', () => {
    expect(typeof paginatedUsers.paginate).toBe('function')
  })

  it('preserves all original store methods', () => {
    expect(typeof paginatedUsers.findById).toBe('function')
    expect(typeof paginatedUsers.create).toBe('function')
    expect(typeof paginatedUsers.find).toBe('function')
  })

  it('returns paginated data with correct meta', async () => {
    const result = await paginatedUsers.paginate({}, { page: 1, pageSize: 10 })
    expect(result.data).toHaveLength(10)
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 50,
      totalPages: 5,
    })
  })

  it('returns correct data for middle pages', async () => {
    const result = await paginatedUsers.paginate({}, { page: 3, pageSize: 10 })
    expect(result.data).toHaveLength(10)
    expect(result.meta.page).toBe(3)
    expect(result.meta.totalPages).toBe(5)
  })

  it('returns partial data for the last page', async () => {
    const result = await paginatedUsers.paginate({}, { page: 4, pageSize: 15 })
    expect(result.data).toHaveLength(5)
    expect(result.meta.totalPages).toBe(4)
  })

  it('returns empty data when page exceeds total pages', async () => {
    const result = await paginatedUsers.paginate({}, { page: 100, pageSize: 10 })
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(50)
  })

  it('uses default pageSize of 25', async () => {
    const result = await paginatedUsers.paginate({}, { page: 1 })
    expect(result.data).toHaveLength(25)
    expect(result.meta.pageSize).toBe(25)
    expect(result.meta.totalPages).toBe(2)
  })

  it('respects custom default pageSize', async () => {
    const custom = withPagination(users, { pageSize: 5 })
    const result = await custom.paginate({}, { page: 1 })
    expect(result.data).toHaveLength(5)
    expect(result.meta.pageSize).toBe(5)
    expect(result.meta.totalPages).toBe(10)
  })

  it('supports equality filters', async () => {
    const result = await paginatedUsers.paginate(
      { name: 'User 01' },
      { page: 1, pageSize: 10 }
    )
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(result.meta.totalPages).toBe(1)
  })

  it('supports where callback', async () => {
    const result = await paginatedUsers.paginate({}, {
      page: 1,
      pageSize: 100,
      where: (t: any) => gt(t.age, 60),
    })
    expect(result.data).toHaveLength(10)
    expect(result.meta.total).toBe(10)
  })

  it('supports orderBy', async () => {
    const result = await paginatedUsers.paginate({}, {
      page: 1,
      pageSize: 3,
      orderBy: { column: 'name', direction: 'desc' },
    })
    expect(result.data[0].name).toBe('User 50')
    expect(result.data[1].name).toBe('User 49')
  })

  it('throws on invalid page number', async () => {
    await expect(
      paginatedUsers.paginate({}, { page: 0, pageSize: 10 })
    ).rejects.toThrow('page must be >= 1')
  })

  it('throws on invalid pageSize', async () => {
    await expect(
      paginatedUsers.paginate({}, { page: 1, pageSize: 0 })
    ).rejects.toThrow('pageSize must be >= 1')
  })

  it('handles empty table', async () => {
    const pgEmptyTable = sqliteTable('pg_empty', {
      id: text('id').primaryKey(),
    })

    db.drizzle.run(sql`CREATE TABLE IF NOT EXISTS pg_empty (id TEXT PRIMARY KEY)`)

    const emptyStore = db.defineStore(pgEmptyTable)
    const paginated = withPagination(emptyStore)

    const result = await paginated.paginate({}, { page: 1, pageSize: 10 })
    expect(result.data).toHaveLength(0)
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    })
  })
})
