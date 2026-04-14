import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const PROJECT_ROOT = process.cwd()
const HEALTH_DIR = `${PROJECT_ROOT}/.health`

export function healthPath(...segments: string[]): string {
  return [HEALTH_DIR, ...segments].join('/')
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function readJSON<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

export function writeJSON(path: string, data: unknown): void {
  ensureDir(dirname(path))
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function fileExists(path: string): boolean {
  return existsSync(path)
}

export type ExecResult = {
  stdout: string
  exitCode: number
}

/**
 * Run a shell command, capturing stdout. Does not throw on non-zero exit
 * (many tools use non-zero to indicate "issues found", not failure).
 */
export function exec(cmd: string, opts?: { cwd?: string; timeout?: number }): ExecResult {
  try {
    const stdout = execSync(cmd, {
      cwd: opts?.cwd ?? PROJECT_ROOT,
      timeout: opts?.timeout ?? 120_000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, exitCode: 0 }
  } catch (err: any) {
    return { stdout: err.stdout ?? '', exitCode: err.status ?? 1 }
  }
}

/**
 * Run a command and parse stdout as JSON. Returns null if parsing fails.
 */
export function execJSON<T>(cmd: string, opts?: { cwd?: string; timeout?: number }): T | null {
  const result = exec(cmd, opts)
  try {
    return JSON.parse(result.stdout) as T
  } catch {
    return null
  }
}

/**
 * ISO timestamp suitable for filenames (no colons).
 */
export function fileTimestamp(): string {
  return new Date().toISOString().replace(/:/g, '-').replace(/\.\d+Z$/, '')
}

/**
 * ISO date string (YYYY-MM-DD).
 */
export function isoDate(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Infer domain from a file path using the first 2-3 meaningful path segments.
 */
export function inferDomain(filePath: string, domainWeights: Record<string, number>): string | null {
  const segments = filePath.split('/').filter(Boolean)
  for (const seg of segments.slice(0, 4)) {
    const lower = seg.toLowerCase()
    if (domainWeights[lower] !== undefined) {
      return lower
    }
  }
  return null
}

/**
 * Classify a file path into a broad category.
 */
export function classifyFile(filePath: string): 'source' | 'test' | 'config' | 'script' | 'fixture' | 'docs' {
  const lower = filePath.toLowerCase()
  if (/__tests__|\.test\.|\.spec\.|test\//.test(lower)) return 'test'
  if (/fixtures?\/|__fixtures__|\.fixture\./.test(lower)) return 'fixture'
  if (/\.config\.|tsconfig|\.env|\.rc|eslint|prettier/.test(lower)) return 'config'
  if (/^bin\/|scripts\/|\.sh$/.test(lower)) return 'script'
  if (/\.md$|docs\/|\.txt$/.test(lower)) return 'docs'
  return 'source'
}
