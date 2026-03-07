import { describe, it, expect } from 'vitest'
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import path from 'node:path'

const bin = path.resolve(__dirname, '../storium.ts')
const opts: ExecFileSyncOptions = { encoding: 'utf8', timeout: 10_000 }

const run = (...args: string[]) =>
  execFileSync('npx', ['tsx', bin, ...args], opts) as string

const runFail = (...args: string[]) => {
  try {
    run(...args)
    throw new Error('expected non-zero exit')
  } catch (err: any) {
    if (err.message === 'expected non-zero exit') throw err
    return { status: err.status as number, output: String(err.stdout ?? '') + String(err.stderr ?? '') }
  }
}

describe('storium CLI', () => {
  it('--help prints usage and exits 0', () => {
    const out = run('--help')
    expect(out).toContain('storium')
    expect(out).toContain('Commands:')
    expect(out).toContain('generate')
    expect(out).toContain('migrate')
    expect(out).toContain('seed')
  })

  it('-h prints usage and exits 0', () => {
    const out = run('-h')
    expect(out).toContain('Commands:')
  })

  it('no args prints usage and exits 1', () => {
    const { status, output } = runFail()
    expect(status).toBe(1)
    expect(output).toContain('Commands:')
  })

  it('unknown command prints error and exits 1', () => {
    const { status, output } = runFail('bogus')
    expect(status).toBe(1)
    expect(output).toContain("Unknown command: 'bogus'")
  })
})
