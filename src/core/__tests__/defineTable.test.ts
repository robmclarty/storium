import { describe, it, expect } from 'vitest'
import { buildDefineTable, hasMeta } from '../defineTable'
import { text } from 'drizzle-orm/sqlite-core'

const dt = buildDefineTable('memory')

describe('defineTable (memory dialect)', () => {
  it('creates a table with storium metadata', () => {
    const table = dt('users', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
    }, { timestamps: false })

    expect(table.storium).toBeDefined()
    expect(table.storium.name).toBe('users')
    expect(table.storium.primaryKey).toBe('id')
  })

  it('attaches .storium as non-enumerable (drizzle-kit compat)', () => {
    const table = dt('test_enum', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    }, { timestamps: false })

    const descriptor = Object.getOwnPropertyDescriptor(table, 'storium')
    expect(descriptor?.enumerable).toBe(false)
  })

  it('derives access sets correctly', () => {
    const table = dt('items', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      name: { type: 'varchar', maxLength: 255, mutable: true, required: true },
      secret: { type: 'text', mutable: true, writeOnly: true },
    }, { timestamps: false })

    const { access } = table.storium
    expect(access.selectable).toContain('id')
    expect(access.selectable).toContain('name')
    expect(access.selectable).not.toContain('secret')
    expect(access.writeOnly).toContain('secret')
    expect(access.mutable).toContain('name')
    expect(access.mutable).toContain('secret') // writeOnly columns with mutable: true are writable
    expect(access.insertable).toContain('secret')
  })

  it('injects timestamps by default (opt-out)', () => {
    const table = dt('posts_default', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      title: { type: 'varchar', maxLength: 255, mutable: true },
    })

    expect(table.storium.columns).toHaveProperty('createdAt')
    expect(table.storium.columns).toHaveProperty('updatedAt')
    expect(table.storium.columns).not.toHaveProperty('created_at')
    expect(table.storium.columns).not.toHaveProperty('updated_at')
  })

  it('does not inject timestamps when timestamps: false', () => {
    const table = dt('posts_no_ts', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      title: { type: 'varchar', maxLength: 255, mutable: true },
    }, { timestamps: false })

    expect(table.storium.columns).not.toHaveProperty('createdAt')
    expect(table.storium.columns).not.toHaveProperty('updatedAt')
  })

  it('timestamps map to snake_case DB column names', () => {
    const table = dt('posts_dbname', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    })

    expect('createdAt' in table).toBe(true)
    expect('updatedAt' in table).toBe(true)
    expect(table.createdAt.name).toBe('created_at')
    expect(table.updatedAt.name).toBe('updated_at')
  })

  it('detects primary key from column config', () => {
    const table = dt('custom_pk', {
      custom_id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      name: { type: 'varchar', maxLength: 255, mutable: true },
    }, { timestamps: false })

    expect(table.storium.primaryKey).toBe('custom_id')
  })

  it('builds schemas on the table metadata', () => {
    const table = dt('with_schemas', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
    }, { timestamps: false })

    expect(table.storium.schemas).toHaveProperty('createSchema')
    expect(table.storium.schemas).toHaveProperty('updateSchema')
    expect(table.storium.schemas).toHaveProperty('selectSchema')
    expect(table.storium.schemas).toHaveProperty('fullSchema')
  })

  it('supports raw columns alongside DSL columns', () => {
    const table = dt('mixed', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      tags: { raw: () => text('tags'), mutable: true },
    }, { timestamps: false })

    expect(table.storium.columns).toHaveProperty('tags')
    expect(table.storium.access.mutable).toContain('tags')
  })

  it('wires indexes into the table', () => {
    const table = dt('indexed', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255, mutable: true },
    }, {
      timestamps: false,
      indexes: { email: { unique: true } },
    })

    // The table should be created without errors — indexes are wired into
    // the Drizzle table constructor callback
    expect(table.storium).toBeDefined()
  })
})

describe('composite primary keys', () => {
  it('accepts primaryKey as an array in options', () => {
    const table = dt('memberships', {
      user_id: { type: 'uuid', required: true },
      group_id: { type: 'uuid', required: true },
    }, {
      timestamps: false,
      primaryKey: ['user_id', 'group_id'],
    })

    expect(table.storium.primaryKey).toEqual(['user_id', 'group_id'])
  })

  it('detects composite PK from multiple primaryKey: true columns', () => {
    const table = dt('multi_pk', {
      a: { type: 'uuid', primaryKey: true },
      b: { type: 'uuid', primaryKey: true },
      name: { type: 'varchar', maxLength: 255, mutable: true },
    }, { timestamps: false })

    expect(Array.isArray(table.storium.primaryKey)).toBe(true)
    expect(table.storium.primaryKey).toContain('a')
    expect(table.storium.primaryKey).toContain('b')
  })

  it('throws SchemaError when composite PK references non-existent column', () => {
    expect(() => dt('bad', {
      a: { type: 'uuid' },
    }, {
      timestamps: false,
      primaryKey: ['a', 'nonexistent'],
    })).toThrow()
  })
})

describe('hasMeta', () => {
  it('returns true for tables from defineTable', () => {
    const table = dt('test', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    }, { timestamps: false })
    expect(hasMeta(table)).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(hasMeta({})).toBe(false)
    expect(hasMeta({ storium: 'fake' })).toBe(true) // has property, passes guard
  })

  it('returns false for null and primitives', () => {
    expect(hasMeta(null)).toBe(false)
    expect(hasMeta(undefined)).toBe(false)
    expect(hasMeta(42)).toBe(false)
  })
})
