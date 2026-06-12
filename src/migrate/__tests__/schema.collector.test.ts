import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { collectSchemas } from '../collector'

const fixturesDir = path.resolve(__dirname, 'fixtures')

describe('collectSchemas', () => {
  /* QA-10040 */ it('[QA-10040] collects Drizzle tables from schema files', async () => {
    const schemas = await collectSchemas(
      path.join(fixturesDir, 'entities/*.table.ts')
    )

    expect(schemas).toHaveProperty('widgets')
  })

  /* QA-10041 */ it('[QA-10041] collects StoreDefinitions from store files', async () => {
    const schemas = await collectSchemas(
      path.join(fixturesDir, 'entities/*.store.ts')
    )

    expect(schemas).toHaveProperty('widgets')
  })

  /* QA-10042 */ it('[QA-10042] handles multiple glob patterns', async () => {
    const schemas = await collectSchemas([
      path.join(fixturesDir, 'entities/*.table.ts'),
      path.join(fixturesDir, 'entities/*.store.ts'),
    ])

    expect(schemas).toHaveProperty('widgets')
  })

  /* QA-10043 */ it('[QA-10043] returns empty map when no files match', async () => {
    const schemas = await collectSchemas('./no-such-path/**/*.ts')
    expect(Object.keys(schemas)).toHaveLength(0)
  })

  /* QA-10044 */ it('[QA-10044] deduplicates tables by name', async () => {
    const schemas = await collectSchemas([
      path.join(fixturesDir, 'entities/*.table.ts'),
      path.join(fixturesDir, 'entities/*.store.ts'),
    ])

    // Both files export 'widgets' — should only appear once
    const widgetEntries = Object.keys(schemas).filter(k => k === 'widgets')
    expect(widgetEntries).toHaveLength(1)
  })

  /* QA-10401 */ it('[QA-10401] throws (fatal) when a schema file fails to import', async () => {
    // A schema file that cannot be imported must abort collection rather than
    // silently producing an incomplete migration.
    await expect(
      collectSchemas(path.join(fixturesDir, 'broken/*.table.ts'))
    ).rejects.toThrow(/Failed to import schema file/)
  })
})
