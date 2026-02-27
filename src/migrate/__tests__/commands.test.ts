import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { status } from '../commands'

describe('status', () => {
  it('reports dialect and empty migrations when none exist', async () => {
    const result = await status({
      dialect: 'sqlite',
      out: './no-such-migrations',
      schema: [],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('sqlite')
    expect(result.message).toContain('(none)')
  })

  it('lists schema files matching the glob', async () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures')

    const result = await status({
      dialect: 'memory',
      out: './no-such-migrations',
      schema: [path.join(fixturesDir, 'entities/*.schema.ts')],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('widget.schema.ts')
  })
})
