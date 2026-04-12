import { describe, it, expect } from 'vitest'
import { defineStore, isStoreDefinition, hasMeta, attachStoriumMeta } from '../defineStore'
import { SchemaError } from '../errors'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { getTableColumns } from 'drizzle-orm/utils'

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  name: text('name'),
})

describe('defineStore', () => {
  it('creates a StoreDefinition from a Drizzle table', () => {
    const store = defineStore(usersTable)
    expect(store.__storeDefinition).toBe(true)
  })

  it('surfaces .table as the Drizzle table', () => {
    const store = defineStore(usersTable)
    expect(store.table).toBe(usersTable)
  })

  it('surfaces .name from the Drizzle table name', () => {
    const store = defineStore(usersTable)
    expect(store.name).toBe('users')
  })

  it('defaults queryFns to empty object when no .queries() called', () => {
    const store = defineStore(usersTable)
    expect(store.queryFns).toEqual({})
  })

  it('stores provided queries via .queries() chain', () => {
    const store = defineStore(usersTable).queries({
      myQuery: () => () => 'result',
    })
    expect(store.queryFns).toHaveProperty('myQuery')
  })

  it('.queries() is chainable', () => {
    const store = defineStore(usersTable)
      .queries({ a: () => () => 'a' })
      .queries({ b: () => () => 'b' })
    expect(store.queryFns).toHaveProperty('a')
    expect(store.queryFns).toHaveProperty('b')
  })

  it('throws SchemaError for non-table values', () => {
    expect(() => defineStore('not a table' as any)).toThrow(SchemaError)
    expect(() => defineStore({} as any)).toThrow(SchemaError)
    expect(() => defineStore(null as any)).toThrow(SchemaError)
  })

  it('accepts optional StoreConfig with column annotations', () => {
    const store = defineStore(usersTable, {
      columns: { email: { required: true } },
    })
    expect(store.__storeDefinition).toBe(true)
  })
})

describe('annotation validation', () => {
  it('throws SchemaError when annotation references a non-existent column', () => {
    const table = sqliteTable('ann_test', {
      id: text('id').primaryKey(),
    })

    expect(() =>
      defineStore(table, {
        columns: { nonexistent: { required: true } },
      })
    ).toThrow(SchemaError)
  })

  it('throws SchemaError when a column is both readonly and hidden', () => {
    const table = sqliteTable('rh_test', {
      id: text('id').primaryKey(),
      secret: text('secret'),
    })

    expect(() =>
      defineStore(table, {
        columns: { secret: { readonly: true, hidden: true } },
      })
    ).toThrow(SchemaError)
  })

  it('throws SchemaError when a column is both readonly and required', () => {
    const table = sqliteTable('rr_test', {
      id: text('id').primaryKey(),
      field: text('field'),
    })

    expect(() =>
      defineStore(table, {
        columns: { field: { readonly: true, required: true } },
      })
    ).toThrow(SchemaError)
  })
})

describe('access derivation', () => {
  it('marks primary key columns as readonly', () => {
    const table = sqliteTable('access_test', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    attachStoriumMeta(table)
    const meta = (table as any).storium

    expect(meta.access.readonly).toContain('id')
    expect(meta.access.writable).not.toContain('id')
  })

  it('marks hidden columns as not selectable', () => {
    const table = sqliteTable('hidden_test', {
      id: text('id').primaryKey(),
      password: text('password'),
    })

    attachStoriumMeta(table, {
      columns: { password: { hidden: true } },
    })
    const meta = (table as any).storium

    expect(meta.access.hidden).toContain('password')
    expect(meta.access.selectable).not.toContain('password')
  })

  it('marks readonly columns as not writable', () => {
    const table = sqliteTable('readonly_test', {
      id: text('id').primaryKey(),
      code: text('code'),
    })

    attachStoriumMeta(table, {
      columns: { code: { readonly: true } },
    })
    const meta = (table as any).storium

    expect(meta.access.readonly).toContain('code')
    expect(meta.access.writable).not.toContain('code')
  })
})

describe('primary key detection', () => {
  it('detects a single primary key column', () => {
    const table = sqliteTable('pk_test', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    attachStoriumMeta(table)
    expect((table as any).storium.primaryKey).toBe('id')
  })

  it('falls back to "id" if no explicit primary key', () => {
    const table = sqliteTable('pk_fallback', {
      id: text('id'),
      name: text('name'),
    })

    attachStoriumMeta(table)
    expect((table as any).storium.primaryKey).toBe('id')
  })
})

describe('soft delete validation', () => {
  it('throws SchemaError when softDelete is enabled but no deletedAt column', () => {
    const table = sqliteTable('no_deleted_at', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    expect(() =>
      defineStore(table, { softDelete: true })
    ).toThrow(SchemaError)
  })

  it('accepts softDelete when deletedAt column exists', () => {
    const table = sqliteTable('with_deleted_at', {
      id: text('id').primaryKey(),
      name: text('name'),
      deletedAt: integer('deleted_at', { mode: 'timestamp' }),
    })

    const store = defineStore(table, { softDelete: true })
    expect(store.__storeDefinition).toBe(true)
    expect((table as any).storium.softDelete).toBe(true)
  })
})

describe('hasMeta', () => {
  it('returns true for tables with storium metadata', () => {
    const table = sqliteTable('meta_test', {
      id: text('id').primaryKey(),
    })
    attachStoriumMeta(table)
    expect(hasMeta(table)).toBe(true)
  })

  it('returns false for plain Drizzle tables', () => {
    const table = sqliteTable('plain_test', {
      id: text('id').primaryKey(),
    })
    expect(hasMeta(table)).toBe(false)
  })

  it('returns false for non-objects', () => {
    expect(hasMeta(null)).toBe(false)
    expect(hasMeta(undefined)).toBe(false)
    expect(hasMeta(42)).toBe(false)
  })
})

describe('isStoreDefinition', () => {
  it('returns true for valid StoreDefinitions', () => {
    const store = defineStore(usersTable)
    expect(isStoreDefinition(store)).toBe(true)
  })

  it('returns true for StoreDefinitions with queries', () => {
    const store = defineStore(usersTable).queries({ q: () => () => null })
    expect(isStoreDefinition(store)).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isStoreDefinition({})).toBe(false)
    expect(isStoreDefinition({ __storeDefinition: false })).toBe(false)
  })

  it('returns false for null and primitives', () => {
    expect(isStoreDefinition(null)).toBe(false)
    expect(isStoreDefinition(undefined)).toBe(false)
    expect(isStoreDefinition(42)).toBe(false)
    expect(isStoreDefinition('string')).toBe(false)
  })
})
