import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import type { TestRegistry, TestRegistryEntry, TestType } from './types.js'
import { isoDate } from './utils.js'

function readRegistry(path: string): TestRegistry {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writeRegistry(path: string, registry: TestRegistry): void {
  writeFileSync(path, JSON.stringify(registry, null, 2) + '\n', 'utf8')
}

type AssignInput = {
  name: string
  suite: string
  file: string
  line: number
  type: TestType
  coveredFiles: string[]
  coveredFunctions: string[]
}

export function assignNextId(registryPath: string, input: AssignInput): string {
  const registry = readRegistry(registryPath)
  const id = `QA-${registry.nextId}`
  const today = isoDate()

  const entry: TestRegistryEntry = {
    id,
    name: input.name,
    suite: input.suite,
    file: input.file,
    line: input.line,
    type: input.type,
    status: 'active',
    coveredFiles: input.coveredFiles,
    coveredFunctions: input.coveredFunctions,
    lastVerified: today,
    lastPassed: null,
    createdAt: today,
  }

  registry.nextId++
  registry.entries.push(entry)
  writeRegistry(registryPath, registry)
  return id
}

export function lookupTest(registryPath: string, testId: string): TestRegistryEntry | null {
  const registry = readRegistry(registryPath)
  return registry.entries.find(e => e.id === testId) ?? null
}

type VerifyReport = {
  active: string[]
  missing: string[]
  stale: string[]
  total: number
}

export function verifyRegistry(registryPath: string): VerifyReport {
  const registry = readRegistry(registryPath)
  const report: VerifyReport = { active: [], missing: [], stale: [], total: registry.entries.length }

  for (const entry of registry.entries) {
    if (!existsSync(entry.file)) {
      entry.status = 'missing'
      report.missing.push(entry.id)
    } else {
      // File exists — check if the test ID is still present (in name or comment)
      const content = readFileSync(entry.file, 'utf8')
      if (!content.includes(entry.id)) {
        entry.status = 'stale'
        report.stale.push(entry.id)
      } else {
        entry.status = 'active'
        entry.lastVerified = isoDate()
        report.active.push(entry.id)
      }
    }
  }

  writeRegistry(registryPath, registry)
  return report
}

// -------------------------------------------------------- Import Analysis --

// Fallback mappings for test files that import from 'storium' (package alias)
// or node builtins, where static import analysis can't trace to source files.
// Keyed by test file base name (without .ts extension).
const HEURISTIC_MAPPINGS: Record<string, string[]> = {
  // Integration tests
  'test/integration/crud.test': ['src/store/repository.ts', 'src/connect.ts', 'src/store/prep.ts'],
  'test/integration/connect.test': ['src/connect.ts'],
  'test/integration/errors.test': ['src/errors.ts', 'src/store/repository.ts'],
  'test/integration/soft-delete.test': ['src/store/repository.ts', 'src/store/define.ts'],
  'test/integration/relationships.test': ['src/mixins/belongsTo.ts', 'src/mixins/hasMany.ts', 'src/mixins/hasOne.ts'],
  'test/integration/pagination.test': ['src/mixins/withPagination.ts'],
  'test/integration/transactions.test': ['src/connect.ts', 'src/store/repository.ts'],
  'test/integration/upsert.test': ['src/store/repository.ts'],
  'test/integration/with-members.test': ['src/mixins/withMembers.ts'],
  'test/integration/concurrency.test': ['src/connect.ts', 'src/store/repository.ts'],
  'test/integration/migrate.test': ['src/migrate/commands.ts'],
  // Unit tests that import from 'storium' package alias instead of relative paths
  'bin/__tests__/cli.test': ['src/migrate/commands.ts'],
  'src/__tests__/sqlite-transaction.test': ['src/connect.ts'],
  'src/mixins/__tests__/withPagination.test': ['src/mixins/withPagination.ts'],
}

/**
 * Infer which source files a test file covers by analyzing its imports.
 *
 * For unit tests: resolves relative imports (e.g., `from '../define'`) to
 * actual source file paths and filters to project source files.
 *
 * For integration tests: uses naming-convention heuristics since they import
 * from the `storium` package alias, not relative paths.
 */
export function inferCoveredFiles(testFilePath: string, projectRoot: string): string[] {
  if (!existsSync(testFilePath)) return []

  const content = readFileSync(testFilePath, 'utf8')
  const testDir = dirname(testFilePath)
  const covered = new Set<string>()

  // Check heuristic mappings first (integration tests, package-alias imports)
  const relPath = relative(projectRoot, testFilePath)
  const heuristicKey = relPath.replace(/\.ts$/, '')
  const heuristic = HEURISTIC_MAPPINGS[heuristicKey]
  if (heuristic) {
    for (const src of heuristic) covered.add(src)
    // Don't return early — also check relative imports to catch additional deps
  }

  // Unit test: parse relative imports
  const importRe = /from\s+['"](\.[^'"]+)['"]/g
  let match
  while ((match = importRe.exec(content)) !== null) {
    const specifier = match[1]

    // Skip test helpers, vitest, external packages
    if (specifier.includes('__tests__') || specifier.includes('.test')) continue

    // Resolve the import to an absolute path
    const candidates = [
      resolve(testDir, specifier + '.ts'),
      resolve(testDir, specifier + '/index.ts'),
      resolve(testDir, specifier),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        const rel = relative(projectRoot, candidate)
        // Only include project source files (src/ or bin/)
        if (rel.startsWith('src/') || rel.startsWith('bin/')) {
          covered.add(rel)
        }
        break
      }
    }
  }

  return [...covered]
}

type UpdateReport = { updated: number; unchanged: number; total: number }

/**
 * Batch-update `coveredFiles` on all registry entries using import analysis.
 * Called during the snapshot pipeline to keep mappings current.
 */
export function updateAllCoveredFiles(registryPath: string, projectRoot: string): UpdateReport {
  const registry = readRegistry(registryPath)
  const report: UpdateReport = { updated: 0, unchanged: 0, total: registry.entries.length }

  // Group entries by test file to avoid re-analyzing the same file
  const byFile = new Map<string, TestRegistryEntry[]>()
  for (const entry of registry.entries) {
    const group = byFile.get(entry.file) ?? []
    group.push(entry)
    byFile.set(entry.file, group)
  }

  for (const [testFile, entries] of byFile) {
    const absPath = resolve(projectRoot, testFile)
    const covered = inferCoveredFiles(absPath, projectRoot)

    for (const entry of entries) {
      const prev = JSON.stringify(entry.coveredFiles.sort())
      const next = JSON.stringify(covered.sort())
      if (prev !== next) {
        entry.coveredFiles = covered
        report.updated++
      } else {
        report.unchanged++
      }
    }
  }

  writeRegistry(registryPath, registry)
  return report
}
