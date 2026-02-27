import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { collectSchemas } from '../schemaCollector'

const fixturesDir = path.resolve(__dirname, 'fixtures')

describe('collectSchemas', () => {
  it('collects TableDefs from schema files', async () => {
    const schemas = await collectSchemas(
      path.join(fixturesDir, 'entities/*.schema.ts')
    )

    expect(schemas).toHaveProperty('widgets')
    expect(schemas.widgets.storium.name).toBe('widgets')
  })

  it('collects StoreDefinitions from store files', async () => {
    const schemas = await collectSchemas(
      path.join(fixturesDir, 'entities/*.store.ts')
    )

    expect(schemas).toHaveProperty('widgets')
  })

  it('handles multiple glob patterns', async () => {
    const schemas = await collectSchemas([
      path.join(fixturesDir, 'entities/*.schema.ts'),
      path.join(fixturesDir, 'entities/*.store.ts'),
    ])

    expect(schemas).toHaveProperty('widgets')
  })

  it('returns empty map when no files match', async () => {
    const schemas = await collectSchemas('./no-such-path/**/*.ts')
    expect(Object.keys(schemas)).toHaveLength(0)
  })

  it('deduplicates tables by name', async () => {
    const schemas = await collectSchemas([
      path.join(fixturesDir, 'entities/*.schema.ts'),
      path.join(fixturesDir, 'entities/*.store.ts'),
    ])

    // Both files export 'widgets' — should only appear once
    const widgetEntries = Object.keys(schemas).filter(k => k === 'widgets')
    expect(widgetEntries).toHaveLength(1)
  })
})
