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
  /* QA-10088 */ it('[QA-10088] adds a paginate method to the store', () => {
    expect(typeof paginatedUsers.paginate).toBe('function')
  })

  /* QA-10089 */ it('[QA-10089] preserves all original store methods', () => {
    expect(typeof paginatedUsers.findById).toBe('function')
    expect(typeof paginatedUsers.create).toBe('function')
    expect(typeof paginatedUsers.find).toBe('function')
  })

  /* QA-10090 */ it('[QA-10090] returns paginated data with correct meta', async () => {
    const result = await paginatedUsers.paginate({}, { page: 1, pageSize: 10 })
    expect(result.data).toHaveLength(10)
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 50,
      totalPages: 5,
    })
  })

  /* QA-10091 */ it('[QA-10091] returns correct data for middle pages', async () => {
    const result = await paginatedUsers.paginate({}, { page: 3, pageSize: 10 })
    expect(result.data).toHaveLength(10)
    expect(result.meta.page).toBe(3)
    expect(result.meta.totalPages).toBe(5)
  })

  /* QA-10092 */ it('[QA-10092] returns partial data for the last page', async () => {
    const result = await paginatedUsers.paginate({}, { page: 4, pageSize: 15 })
    expect(result.data).toHaveLength(5)
    expect(result.meta.totalPages).toBe(4)
  })

  /* QA-10093 */ it('[QA-10093] returns empty data when page exceeds total pages', async () => {
    const result = await paginatedUsers.paginate({}, { page: 100, pageSize: 10 })
    expect(result.data).toHaveLength(0)
    expect(result.meta.total).toBe(50)
  })

  /* QA-10094 */ it('[QA-10094] uses default pageSize of 25', async () => {
    const result = await paginatedUsers.paginate({}, { page: 1 })
    expect(result.data).toHaveLength(25)
    expect(result.meta.pageSize).toBe(25)
    expect(result.meta.totalPages).toBe(2)
  })

  /* QA-10095 */ it('[QA-10095] respects custom default pageSize', async () => {
    const custom = withPagination(users, { pageSize: 5 })
    const result = await custom.paginate({}, { page: 1 })
    expect(result.data).toHaveLength(5)
    expect(result.meta.pageSize).toBe(5)
    expect(result.meta.totalPages).toBe(10)
  })

  /* QA-10096 */ it('[QA-10096] supports equality filters', async () => {
    const result = await paginatedUsers.paginate(
      { name: 'User 01' },
      { page: 1, pageSize: 10 }
    )
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
    expect(result.meta.totalPages).toBe(1)
  })

  /* QA-10097 */ it('[QA-10097] supports where callback', async () => {
    const result = await paginatedUsers.paginate({}, {
      page: 1,
      pageSize: 100,
      where: (t: any) => gt(t.age, 60),
    })
    expect(result.data).toHaveLength(10)
    expect(result.meta.total).toBe(10)
  })

  /* QA-10098 */ it('[QA-10098] supports orderBy', async () => {
    const result = await paginatedUsers.paginate({}, {
      page: 1,
      pageSize: 3,
      orderBy: { column: 'name', direction: 'desc' },
    })
    expect(result.data[0].name).toBe('User 50')
    expect(result.data[1].name).toBe('User 49')
  })

  /* QA-10099 */ it('[QA-10099] throws on invalid page number', async () => {
    await expect(
      paginatedUsers.paginate({}, { page: 0, pageSize: 10 })
    ).rejects.toThrow('page must be >= 1')
  })

  /* QA-10100 */ it('[QA-10100] throws on invalid pageSize', async () => {
    await expect(
      paginatedUsers.paginate({}, { page: 1, pageSize: 0 })
    ).rejects.toThrow('pageSize must be >= 1')
  })

  /* QA-10101 */ it('[QA-10101] handles empty table', async () => {
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

  /* QA-10102 */ it('[QA-10102] does not add paginateWithDeleted for non-soft-delete stores', () => {
    expect(paginatedUsers.paginateWithDeleted).toBeUndefined()
  })
})

describe('withPagination + softDelete', () => {
  const tasksTable = sqliteTable('sd_tasks', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  })

  let sdDb: any
  let tasks: any
  let paginatedTasks: any

  beforeAll(async () => {
    sdDb = storium.connect({ dialect: 'memory' })

    sdDb.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS sd_tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, deleted_at INTEGER
      )
    `)

    const taskStore = defineStore(tasksTable, { softDelete: true })
    tasks = sdDb.register({ tasks: taskStore }).tasks
    paginatedTasks = withPagination(tasks)

    // Create 10 tasks, soft-delete 3 of them
    for (let i = 1; i <= 10; i++) {
      await tasks.create({ id: `task-${i}`, title: `Task ${i}` })
    }
    await tasks.destroy('task-1')
    await tasks.destroy('task-2')
    await tasks.destroy('task-3')
  })

  /* QA-10103 */ it('[QA-10103] adds paginateWithDeleted for soft-delete stores', () => {
    expect(typeof paginatedTasks.paginateWithDeleted).toBe('function')
  })

  /* QA-10104 */ it('[QA-10104] paginate excludes soft-deleted rows', async () => {
    const result = await paginatedTasks.paginate({}, { page: 1, pageSize: 100 })
    expect(result.meta.total).toBe(7)
    expect(result.data).toHaveLength(7)
  })

  /* QA-10105 */ it('[QA-10105] paginateWithDeleted includes soft-deleted rows', async () => {
    const result = await paginatedTasks.paginateWithDeleted({}, { page: 1, pageSize: 100 })
    expect(result.meta.total).toBe(10)
    expect(result.data).toHaveLength(10)
  })

  /* QA-10106 */ it('[QA-10106] paginateWithDeleted respects pagination opts', async () => {
    const result = await paginatedTasks.paginateWithDeleted({}, { page: 1, pageSize: 4 })
    expect(result.data).toHaveLength(4)
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 4,
      total: 10,
      totalPages: 3,
    })
  })

  /* QA-10107 */ it('[QA-10107] paginateWithDeleted supports filters', async () => {
    const result = await paginatedTasks.paginateWithDeleted(
      { title: 'Task 1' },
      { page: 1, pageSize: 10 }
    )
    expect(result.data).toHaveLength(1)
    expect(result.meta.total).toBe(1)
  })
})
