import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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
      // File exists — check if the test ID comment is still present
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
