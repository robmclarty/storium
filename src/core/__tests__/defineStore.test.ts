import { describe, it, expect } from 'vitest'
import { defineStore, isStoreDefinition } from '../defineStore'
import { buildDefineTable } from '../defineTable'
import { ConfigError } from '../errors'

const dt = buildDefineTable('memory')

const usersTable = dt('users', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
}, { timestamps: false })

describe('defineStore', () => {
  it('creates a StoreDefinition from a table', () => {
    const store = defineStore(usersTable)
    expect(store.__storeDefinition).toBe(true)
  })

  it('surfaces .table as the tableDef', () => {
    const store = defineStore(usersTable)
    expect(store.table).toBe(usersTable)
  })

  it('surfaces .name from table metadata', () => {
    const store = defineStore(usersTable)
    expect(store.name).toBe('users')
  })

  it('defaults queries to empty object when omitted', () => {
    const store = defineStore(usersTable)
    expect(store.queries).toEqual({})
  })

  it('stores provided queries', () => {
    const store = defineStore(usersTable, { myQuery: () => () => 'result' })
    expect(store.queries).toHaveProperty('myQuery')
  })

  it('throws ConfigError for non-table values', () => {
    expect(() => defineStore('not a table' as any)).toThrow(ConfigError)
    expect(() => defineStore({} as any)).toThrow(ConfigError)
    expect(() => defineStore(null as any)).toThrow(ConfigError)
  })
})

describe('isStoreDefinition', () => {
  it('returns true for valid StoreDefinitions', () => {
    const store = defineStore(usersTable)
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
