import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { resolveConfigPath, loadConfig } from '../config'
import { ConfigError } from '../../errors'

describe('resolveConfigPath', () => {
  const originalEnv = { ...process.env }
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    process.chdir(originalCwd)
  })

  it('respects STORIUM_CONFIG env var', () => {
    process.env.STORIUM_CONFIG = '/custom/storium.config.ts'
    delete process.env.DRIZZLE_CONFIG
    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(process.cwd(), '/custom/storium.config.ts'))
  })

  it('respects DRIZZLE_CONFIG env var when STORIUM_CONFIG is not set', () => {
    delete process.env.STORIUM_CONFIG
    process.env.DRIZZLE_CONFIG = '/custom/drizzle.config.ts'
    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(process.cwd(), '/custom/drizzle.config.ts'))
  })

  it('STORIUM_CONFIG takes priority over DRIZZLE_CONFIG', () => {
    process.env.STORIUM_CONFIG = '/storium.config.ts'
    process.env.DRIZZLE_CONFIG = '/drizzle.config.ts'
    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(process.cwd(), '/storium.config.ts'))
  })

  it('finds storium.config.ts in cwd', () => {
    delete process.env.STORIUM_CONFIG
    delete process.env.DRIZZLE_CONFIG

    const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'storium-test-')))
    fs.writeFileSync(path.join(tmpDir, 'storium.config.ts'), 'export default {}')
    process.chdir(tmpDir)

    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(tmpDir, 'storium.config.ts'))

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('falls back to drizzle.config.ts when storium.config.ts absent', () => {
    delete process.env.STORIUM_CONFIG
    delete process.env.DRIZZLE_CONFIG

    const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'storium-test-')))
    fs.writeFileSync(path.join(tmpDir, 'drizzle.config.ts'), 'export default {}')
    process.chdir(tmpDir)

    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(tmpDir, 'drizzle.config.ts'))

    fs.rmSync(tmpDir, { recursive: true })
  })

  it('defaults to storium.config.ts when no config file found', () => {
    delete process.env.STORIUM_CONFIG
    delete process.env.DRIZZLE_CONFIG

    const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'storium-test-')))
    process.chdir(tmpDir)

    const result = resolveConfigPath()
    expect(result).toBe(path.resolve(tmpDir, 'storium.config.ts'))

    fs.rmSync(tmpDir, { recursive: true })
  })
})

describe('loadConfig', () => {
  it('throws ConfigError when config has no dialect', async () => {
    const fixturesDir = path.resolve(__dirname, 'fixtures')
    const configPath = path.join(fixturesDir, 'no-dialect.config.mjs')

    // Create a temp config file without dialect
    fs.writeFileSync(configPath, 'export default { schema: ["./src/**/*.ts"] }')

    try {
      await expect(loadConfig(configPath)).rejects.toThrow(ConfigError)
      await expect(loadConfig(configPath)).rejects.toThrow('dialect')
    } finally {
      fs.unlinkSync(configPath)
    }
  })

  it('includes tsx hint for .ts files on import failure', async () => {
    try {
      await loadConfig('/nonexistent/config.ts')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConfigError)
      expect(err.message).toContain('tsx')
    }
  })
})
