import { describe, it, expect, beforeAll } from 'vitest'
import { storium } from 'storium'
import { sql } from 'drizzle-orm'
import path from 'node:path'
import { defineSeed, seed } from '../seed'


describe('defineSeed', () => {
  /* QA-10045 */ it('[QA-10045] returns a seed module with __isSeed marker', () => {
    const seedModule = defineSeed(async () => {})
    expect(seedModule.__isSeed).toBe(true)
    expect(typeof seedModule.run).toBe('function')
  })

  /* QA-10046 */ it('[QA-10046] wraps the provided function as .run', async () => {
    let called = false
    const seedModule = defineSeed(async () => { called = true })
    await seedModule.run({} as any)
    expect(called).toBe(true)
  })
})

describe('seed runner', () => {
  let db: any

  beforeAll(() => {
    db = storium.connect({ dialect: 'memory' })

    db.drizzle.run(sql`
      CREATE TABLE IF NOT EXISTS widgets (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL
      )
    `)
  })

  /* QA-10047 */ it('[QA-10047] runs seed files from a directory and returns success', async () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures')

    const result = await seed(db, {
      dialect: 'memory',
      schema: [path.join(fixturesDir, 'entities/*.table.ts')],
      stores: [path.join(fixturesDir, 'entities/*.store.ts')],
      seeds: path.join(fixturesDir, 'seeds'),
    })

    expect(result.success).toBe(true)
    expect(result.count).toBe(1)
  })

  /* QA-10048 */ it('[QA-10048] returns count 0 when no seed files exist', async () => {
    const result = await seed(db, {
      dialect: 'memory',
      seeds: './nonexistent-seeds-dir',
    })

    expect(result.success).toBe(true)
    expect(result.count).toBe(0)
    expect(result.message).toContain('No seed files')
  })

  /* QA-10402 */ it('[QA-10402] throws (fatal) when a discovered schema file fails to import', async () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures')

    // A store/schema file that cannot be imported must abort the seed run
    // rather than silently seeding against an incomplete set of stores.
    await expect(
      seed(db, {
        dialect: 'memory',
        schema: [path.join(fixturesDir, 'broken/*.table.ts')],
        seeds: path.join(fixturesDir, 'seeds'),
      })
    ).rejects.toThrow(/Failed to import/)
  })
})
