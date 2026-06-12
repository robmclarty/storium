import { describe, it, expect } from 'vitest'
import { defineStore, isStoreDefinition, hasMeta, attachStoriumMeta } from '../define'
import { SchemaError } from '../../errors'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'


const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  name: text('name'),
})

describe('defineStore', () => {
  /* QA-10197 */ it('[QA-10197] creates a StoreDefinition from a Drizzle table', () => {
    const store = defineStore(usersTable)
    expect(store.__storeDefinition).toBe(true)
  })

  /* QA-10198 */ it('[QA-10198] surfaces .table as the Drizzle table', () => {
    const store = defineStore(usersTable)
    expect(store.table).toBe(usersTable)
  })

  /* QA-10199 */ it('[QA-10199] surfaces .name from the Drizzle table name', () => {
    const store = defineStore(usersTable)
    expect(store.name).toBe('users')
  })

  /* QA-10200 */ it('[QA-10200] defaults queryFns to empty object when no .queries() called', () => {
    const store = defineStore(usersTable)
    expect(store.queryFns).toEqual({})
  })

  /* QA-10201 */ it('[QA-10201] stores provided queries via .queries() chain', () => {
    const store = defineStore(usersTable).queries({
      myQuery: () => () => 'result',
    })
    expect(store.queryFns).toHaveProperty('myQuery')
  })

  /* QA-10202 */ it('[QA-10202] .queries() is chainable', () => {
    const store = defineStore(usersTable)
      .queries({ a: () => () => 'a' })
      .queries({ b: () => () => 'b' })
    expect(store.queryFns).toHaveProperty('a')
    expect(store.queryFns).toHaveProperty('b')
  })

  /* QA-10203 */ it('[QA-10203] throws SchemaError for non-table values', () => {
    expect(() => defineStore('not a table' as any)).toThrow(SchemaError)
    expect(() => defineStore({} as any)).toThrow(SchemaError)
    expect(() => defineStore(null as any)).toThrow(SchemaError)
  })

  /* QA-10204 */ it('[QA-10204] accepts optional StoreConfig with column annotations', () => {
    const store = defineStore(usersTable, {
      columns: { email: { required: true } },
    })
    expect(store.__storeDefinition).toBe(true)
  })
})

describe('annotation validation', () => {
  /* QA-10205 */ it('[QA-10205] throws SchemaError when annotation references a non-existent column', () => {
    const table = sqliteTable('ann_test', {
      id: text('id').primaryKey(),
    })

    expect(() =>
      defineStore(table, {
        // The generic StoreConfig<TTable> also rejects this key at compile time;
        // @ts-expect-error documents that guard while we exercise the runtime backstop.
        columns: { nonexistent: { required: true } },
      })
    ).toThrow(SchemaError)
  })

  /* QA-10206 */ it('[QA-10206] throws SchemaError when a column is both readonly and hidden', () => {
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

  /* QA-10207 */ it('[QA-10207] throws SchemaError when a column is both readonly and required', () => {
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
  /* QA-10208 */ it('[QA-10208] marks primary key columns as readonly', () => {
    const table = sqliteTable('access_test', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    attachStoriumMeta(table)
    const meta = (table as any).storium

    expect(meta.access.readonly).toContain('id')
    expect(meta.access.writable).not.toContain('id')
  })

  /* QA-10209 */ it('[QA-10209] marks hidden columns as not selectable', () => {
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

  /* QA-10210 */ it('[QA-10210] marks readonly columns as not writable', () => {
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
  /* QA-10211 */ it('[QA-10211] detects a single primary key column', () => {
    const table = sqliteTable('pk_test', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    attachStoriumMeta(table)
    expect((table as any).storium.primaryKey).toBe('id')
  })

  /* QA-10212 */ it('[QA-10212] returns undefined when no column is marked as primary key', () => {
    const table = sqliteTable('pk_fallback', {
      id: text('id'),
      name: text('name'),
    })

    attachStoriumMeta(table)
    expect((table as any).storium.primaryKey).toBeUndefined()
  })
})

describe('soft delete validation', () => {
  /* QA-10213 */ it('[QA-10213] throws SchemaError when softDelete is enabled but no deletedAt column', () => {
    const table = sqliteTable('no_deleted_at', {
      id: text('id').primaryKey(),
      name: text('name'),
    })

    expect(() =>
      defineStore(table, { softDelete: true })
    ).toThrow(SchemaError)
  })

  /* QA-10214 */ it('[QA-10214] accepts softDelete when deletedAt column exists', () => {
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
  /* QA-10215 */ it('[QA-10215] returns true for tables with storium metadata', () => {
    const table = sqliteTable('meta_test', {
      id: text('id').primaryKey(),
    })
    attachStoriumMeta(table)
    expect(hasMeta(table)).toBe(true)
  })

  /* QA-10216 */ it('[QA-10216] returns false for plain Drizzle tables', () => {
    const table = sqliteTable('plain_test', {
      id: text('id').primaryKey(),
    })
    expect(hasMeta(table)).toBe(false)
  })

  /* QA-10217 */ it('[QA-10217] returns false for non-objects', () => {
    expect(hasMeta(null)).toBe(false)
    expect(hasMeta(undefined)).toBe(false)
    expect(hasMeta(42)).toBe(false)
  })
})

describe('isStoreDefinition', () => {
  /* QA-10218 */ it('[QA-10218] returns true for valid StoreDefinitions', () => {
    const store = defineStore(usersTable)
    expect(isStoreDefinition(store)).toBe(true)
  })

  /* QA-10219 */ it('[QA-10219] returns true for StoreDefinitions with queries', () => {
    const store = defineStore(usersTable).queries({ q: () => () => null })
    expect(isStoreDefinition(store)).toBe(true)
  })

  /* QA-10220 */ it('[QA-10220] returns false for plain objects', () => {
    expect(isStoreDefinition({})).toBe(false)
    expect(isStoreDefinition({ __storeDefinition: false })).toBe(false)
  })

  /* QA-10221 */ it('[QA-10221] returns false for null and primitives', () => {
    expect(isStoreDefinition(null)).toBe(false)
    expect(isStoreDefinition(undefined)).toBe(false)
    expect(isStoreDefinition(42)).toBe(false)
    expect(isStoreDefinition('string')).toBe(false)
  })
})
