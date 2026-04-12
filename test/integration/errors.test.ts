/**
 * Error recovery tests across dialects.
 *
 * Verifies constraint violations and error paths produce meaningful errors.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { StoreError } from 'storium'
import { createTestDatabase, getTestDialects, type TestDatabase } from '../dialects'
import { getTables, getDDL } from '../tables'

for (const dialect of getTestDialects()) {
  describe(`Error recovery [${dialect}]`, () => {
    let ctx: TestDatabase
    let users: any

    beforeAll(async () => {
      ctx = await createTestDatabase(dialect)
      const tables = getTables(dialect)
      const ddlStatements = getDDL(dialect)

      // Create tables with UNIQUE constraint on email
      const usersWithUnique = dialect === 'memory'
        ? `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            name TEXT,
            password_hash TEXT
          )`
        : dialect === 'postgresql'
          ? `CREATE TABLE IF NOT EXISTS users (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              email VARCHAR(255) NOT NULL UNIQUE,
              name VARCHAR(255),
              password_hash TEXT
            )`
          : `CREATE TABLE IF NOT EXISTS users (
              id VARCHAR(36) PRIMARY KEY,
              email VARCHAR(255) NOT NULL UNIQUE,
              name VARCHAR(255),
              password_hash TEXT
            )`

      if (dialect === 'memory') {
        ctx.storium.drizzle.run(sql.raw(usersWithUnique))
      } else {
        await ctx.storium.drizzle.execute(sql.raw(usersWithUnique))
      }

      users = ctx.storium.defineStore(tables.users, {
        columns: { email: { required: true } },
      })
    })

    afterAll(async () => {
      await ctx.teardown()
    })

    it('UNIQUE constraint violation throws on duplicate insert', async () => {
      await users.create({ email: 'unique_constraint@test.com', name: 'First' })

      await expect(
        users.create({ email: 'unique_constraint@test.com', name: 'Duplicate' })
      ).rejects.toThrow()
    })

    it('destroy throws StoreError for non-existent row', async () => {
      await expect(
        users.destroy('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(StoreError)
    })

    it('update throws StoreError for non-existent row', async () => {
      await expect(
        users.update('00000000-0000-0000-0000-000000000000', { name: 'X' })
      ).rejects.toThrow(StoreError)
    })

    it('ref throws StoreError for non-existent row', async () => {
      await expect(
        users.ref({ email: 'definitely_not_here@test.com' })
      ).rejects.toThrow(StoreError)
    })

    it('find throws StoreError for unknown filter key', async () => {
      await expect(
        users.find({ bogusColumn: 'value' })
      ).rejects.toThrow(StoreError)
    })
  })
}
