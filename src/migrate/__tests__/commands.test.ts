import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { status, generate, push } from '../commands'

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
      schema: [path.join(fixturesDir, 'entities/*.table.ts')],
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('widget.table.ts')
  })
})

describe('generate', () => {
  it('returns failure result when drizzle-kit config is missing', async () => {
    // Point at a non-existent config so drizzle-kit fails
    vi.stubEnv('STORIUM_CONFIG', '/nonexistent/config.ts')

    const result = await generate()
    expect(result.success).toBe(false)
    expect(result.message).toContain('failed')

    vi.unstubAllEnvs()
  })
})

describe('push', () => {
  it('returns failure result when drizzle-kit config is missing', async () => {
    vi.stubEnv('STORIUM_CONFIG', '/nonexistent/config.ts')

    const result = await push()
    expect(result.success).toBe(false)
    expect(result.message).toContain('failed')

    vi.unstubAllEnvs()
  })
})
