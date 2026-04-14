/**
 * Migration integration tests.
 *
 * Verifies that migrate() applies pending migrations and is idempotent.
 * Uses in-memory SQLite to avoid testcontainers overhead.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { sql } from 'drizzle-orm'
import { storium } from 'storium'
import { migrate } from 'storium/migrate'

describe('migrate()', () => {
  let tmpDir: string
  let migrationsDir: string

  beforeAll(() => {
    // Create a temp directory with migration fixtures in Drizzle journal format
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storium-migrate-test-'))
    migrationsDir = path.join(tmpDir, 'migrations')
    fs.mkdirSync(migrationsDir)

    // Create a journal.json
    const journal = {
      version: '7',
      dialect: 'sqlite',
      entries: [
        {
          idx: 0,
          version: '5',
          when: Date.now(),
          tag: '0000_initial',
          breakpoints: true,
        },
      ],
    }

    const metaDir = path.join(migrationsDir, 'meta')
    fs.mkdirSync(metaDir)
    fs.writeFileSync(
      path.join(metaDir, '_journal.json'),
      JSON.stringify(journal, null, 2)
    )

    // Create a snapshot file (required by drizzle-orm migrator)
    fs.writeFileSync(
      path.join(metaDir, '0000_snapshot.json'),
      JSON.stringify({
        version: '6',
        dialect: 'sqlite',
        id: 'test-snapshot',
        prevId: '0000000000',
        tables: {},
        enums: {},
        _meta: { tables: {}, columns: {} },
      })
    )

    // Create the migration SQL file
    fs.writeFileSync(
      path.join(migrationsDir, '0000_initial.sql'),
      `CREATE TABLE IF NOT EXISTS migrate_test_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);`
    )
  })

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  /* QA-10341 */ it('[QA-10341] applies pending migrations — table appears in DB', async () => {
    const db = storium.connect({ dialect: 'memory' })

    const result = await migrate(db, {
      dialect: 'memory',
      out: migrationsDir,
    })

    expect(result.success).toBe(true)

    // Verify the table was created
    const rows = db.drizzle.all(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name='migrate_test_items'`
    )
    expect(rows).toHaveLength(1)

    await db.disconnect()
  })

  /* QA-10342 */ it('[QA-10342] is idempotent — running twice does not error', async () => {
    const db = storium.connect({ dialect: 'memory' })

    const first = await migrate(db, { dialect: 'memory', out: migrationsDir })
    expect(first.success).toBe(true)

    const second = await migrate(db, { dialect: 'memory', out: migrationsDir })
    expect(second.success).toBe(true)

    await db.disconnect()
  })
})
