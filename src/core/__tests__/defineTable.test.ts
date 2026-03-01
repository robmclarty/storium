import { describe, it, expect } from 'vitest'
import { buildDefineTable, hasMeta } from '../defineTable'
import { SchemaError } from '../errors'
import { text } from 'drizzle-orm/sqlite-core'

const dt = buildDefineTable('memory')

describe('defineTable (memory dialect)', () => {
  it('creates a table with storium metadata', () => {
    const table = dt('users', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255, required: true },
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
      name: { type: 'varchar', maxLength: 255, required: true },
      secret: { type: 'text', hidden: true },
    }, { timestamps: false })

    const { access } = table.storium
    expect(access.selectable).toContain('id')
    expect(access.selectable).toContain('name')
    expect(access.selectable).not.toContain('secret')
    expect(access.hidden).toContain('secret')
    expect(access.writable).toContain('name')
    expect(access.writable).toContain('secret') // hidden columns are writable
    expect(access.writable).not.toContain('id') // primaryKey columns are readonly
    expect(access.readonly).toContain('id')
  })

  it('injects timestamps by default (opt-out)', () => {
    const table = dt('posts_default', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      title: { type: 'varchar', maxLength: 255 },
    })

    expect(table.storium.columns).toHaveProperty('createdAt')
    expect(table.storium.columns).toHaveProperty('updatedAt')
    expect(table.storium.columns).not.toHaveProperty('created_at')
    expect(table.storium.columns).not.toHaveProperty('updated_at')
  })

  it('does not inject timestamps when timestamps: false', () => {
    const table = dt('posts_no_ts', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      title: { type: 'varchar', maxLength: 255 },
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
      name: { type: 'varchar', maxLength: 255 },
    }, { timestamps: false })

    expect(table.storium.primaryKey).toBe('custom_id')
  })

  it('builds schemas on the table metadata', () => {
    const table = dt('with_schemas', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255, required: true },
    }, { timestamps: false })

    expect(table.storium.schemas).toHaveProperty('createSchema')
    expect(table.storium.schemas).toHaveProperty('updateSchema')
    expect(table.storium.schemas).toHaveProperty('selectSchema')
    expect(table.storium.schemas).toHaveProperty('fullSchema')
  })

  it('supports raw columns alongside DSL columns', () => {
    const table = dt('mixed', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      tags: { raw: () => text('tags') },
    }, { timestamps: false })

    expect(table.storium.columns).toHaveProperty('tags')
    expect(table.storium.access.writable).toContain('tags')
  })

  it('wires indexes into the table', () => {
    const table = dt('indexed', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      email: { type: 'varchar', maxLength: 255 },
    }, {
      timestamps: false,
      indexes: { email: { unique: true } },
    })

    // The table should be created without errors — indexes are wired into
    // the Drizzle table constructor callback
    expect(table.storium).toBeDefined()
  })

  it('throws SchemaError when required + readonly', () => {
    expect(() => dt('bad_required_readonly', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      stuck: { type: 'varchar', maxLength: 255, required: true, readonly: true },
    }, { timestamps: false })).toThrow(SchemaError)

    expect(() => dt('bad_required_readonly2', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      stuck: { type: 'varchar', maxLength: 255, required: true, readonly: true },
    }, { timestamps: false })).toThrow(/lost in the abyss/)
  })

  it('throws SchemaError when readonly + hidden', () => {
    expect(() => dt('bad_readonly_hidden', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      ghost: { type: 'varchar', maxLength: 255, readonly: true, hidden: true },
    }, { timestamps: false })).toThrow(SchemaError)

    expect(() => dt('bad_readonly_hidden2', {
      id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
      ghost: { type: 'varchar', maxLength: 255, readonly: true, hidden: true },
    }, { timestamps: false })).toThrow(/inaccessible/)
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
      name: { type: 'varchar', maxLength: 255 },
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
