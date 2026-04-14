import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { assignNextId, lookupTest, verifyRegistry } from '../registry.js'
import type { TestRegistry, TestRegistryEntry } from '../types.js'

const TEST_DIR = '/tmp/qa-registry-test'
const REGISTRY_PATH = `${TEST_DIR}/test-registry.json`

function seedRegistry(entries: TestRegistryEntry[] = [], nextId = 10000): void {
  mkdirSync(TEST_DIR, { recursive: true })
  writeFileSync(REGISTRY_PATH, JSON.stringify({ version: 1, nextId, entries }, null, 2))
}

function readRegistry(): TestRegistry {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'))
}

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true })
})

describe('assignNextId', () => {
  it('assigns QA-10000 on empty registry', () => {
    seedRegistry()
    const id = assignNextId(REGISTRY_PATH, {
      name: 'should hash password',
      suite: 'UserService',
      file: 'src/users/user.test.ts',
      line: 10,
      type: 'unit',
      coveredFiles: ['src/users/user.service.ts'],
      coveredFunctions: ['hashPassword'],
    })
    expect(id).toBe('QA-10000')
    const reg = readRegistry()
    expect(reg.nextId).toBe(10001)
    expect(reg.entries).toHaveLength(1)
    expect(reg.entries[0].status).toBe('active')
  })

  it('increments ID on subsequent assignments', () => {
    seedRegistry([], 10005)
    const id = assignNextId(REGISTRY_PATH, {
      name: 'test2',
      suite: 'Suite',
      file: 'a.test.ts',
      line: 1,
      type: 'unit',
      coveredFiles: [],
      coveredFunctions: [],
    })
    expect(id).toBe('QA-10005')
    expect(readRegistry().nextId).toBe(10006)
  })
})

describe('lookupTest', () => {
  it('returns the entry for a valid ID', () => {
    seedRegistry([{
      id: 'QA-10000', name: 'test1', suite: 'S', file: 'a.ts', line: 1,
      type: 'unit', status: 'active', coveredFiles: [], coveredFunctions: [],
      lastVerified: '2026-04-13', lastPassed: '2026-04-13', createdAt: '2026-04-13',
    }])
    const result = lookupTest(REGISTRY_PATH, 'QA-10000')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('test1')
  })

  it('returns null for unknown ID', () => {
    seedRegistry()
    expect(lookupTest(REGISTRY_PATH, 'QA-99999')).toBeNull()
  })
})

describe('verifyRegistry', () => {
  it('marks tests as missing when file does not exist', () => {
    seedRegistry([{
      id: 'QA-10000', name: 'test1', suite: 'S',
      file: '/tmp/nonexistent.test.ts', line: 1,
      type: 'unit', status: 'active', coveredFiles: [], coveredFunctions: [],
      lastVerified: '2026-04-13', lastPassed: '2026-04-13', createdAt: '2026-04-13',
    }])
    const report = verifyRegistry(REGISTRY_PATH)
    expect(report.missing).toContain('QA-10000')
    const reg = readRegistry()
    expect(reg.entries[0].status).toBe('missing')
  })
})
