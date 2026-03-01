import { describe, it, expect } from 'vitest'
import { buildIndexes } from '../indexes'
import { SchemaError } from '../errors'
import type { ColumnsConfig } from '../types'

const schemaColumns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true },
  email: { type: 'varchar', maxLength: 255 },
  name: { type: 'varchar', maxLength: 255 },
  school_id: { type: 'uuid' },
  role: { type: 'varchar', maxLength: 50 },
}

// Minimal mock table object that has column-named properties
const mockTable: Record<string, any> = {
  id: { name: 'id' },
  email: { name: 'email' },
  name: { name: 'name' },
  school_id: { name: 'school_id' },
  role: { name: 'role' },
}

describe('buildIndexes', () => {
  it('builds a single-column index using key name as column', () => {
    const builder = buildIndexes('users', { email: {} }, schemaColumns, 'memory')
    const result = builder(mockTable)
    expect(result).toHaveProperty('email')
  })

  it('builds a unique index', () => {
    const builder = buildIndexes('users', { email: { unique: true } }, schemaColumns, 'memory')
    const result = builder(mockTable)
    expect(result).toHaveProperty('email')
  })

  it('builds a multi-column index', () => {
    const builder = buildIndexes(
      'users',
      { school_role: { columns: ['school_id', 'role'] } },
      schemaColumns,
      'memory'
    )
    const result = builder(mockTable)
    expect(result).toHaveProperty('school_role')
  })

  it('throws SchemaError when shorthand key does not match a column', () => {
    expect(() => {
      const builder = buildIndexes('users', { nonexistent: {} }, schemaColumns, 'memory')
      builder(mockTable)
    }).toThrow(SchemaError)
  })

  it('throws SchemaError when explicit columns reference non-existent column', () => {
    expect(() => {
      buildIndexes(
        'users',
        { bad: { columns: ['nonexistent'] } },
        schemaColumns,
        'memory'
      )(mockTable)
    }).toThrow(SchemaError)
  })

  it('uses raw escape hatch when provided', () => {
    const rawIndex = { name: 'custom_raw' }
    const builder = buildIndexes(
      'users',
      { custom: { raw: () => rawIndex } },
      schemaColumns,
      'memory'
    )
    const result = builder(mockTable)
    expect(result.custom).toBe(rawIndex)
  })
})
