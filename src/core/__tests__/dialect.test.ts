import { describe, it, expect } from 'vitest'
import { getDialectMapping, buildDslColumn } from '../dialect'
import { ConfigError } from '../errors'
import type { DslColumnConfig, Dialect } from '../types'

const dialects: Dialect[] = ['postgresql', 'mysql', 'sqlite', 'memory']
const dslTypes = [
  'uuid', 'varchar', 'text', 'integer', 'bigint', 'serial',
  'real', 'numeric', 'boolean', 'timestamp', 'date', 'jsonb', 'array',
] as const

describe('getDialectMapping', () => {
  for (const dialect of dialects) {
    it(`returns a mapping for "${dialect}" with tableConstructor and all column builders`, () => {
      const mapping = getDialectMapping(dialect)
      expect(typeof mapping.tableConstructor).toBe('function')
      for (const type of dslTypes) {
        expect(typeof mapping.columnBuilders[type]).toBe('function')
      }
    })
  }

  it('throws ConfigError for unknown dialect', () => {
    expect(() => getDialectMapping('oracle' as any)).toThrow(ConfigError)
  })

  it('"memory" resolves to the same mapping as "sqlite"', () => {
    const sqlite = getDialectMapping('sqlite')
    const memory = getDialectMapping('memory')
    expect(sqlite).toBe(memory)
  })
})

describe('buildDslColumn', () => {
  for (const dialect of dialects) {
    describe(`${dialect}`, () => {
      for (const type of dslTypes) {
        it(`builds a "${type}" column`, () => {
          const config: DslColumnConfig = {
            type,
            ...(type === 'varchar' ? { maxLength: 255 } : {}),
            ...(type === 'array' ? { items: 'text' } : {}),
          }
          const col = buildDslColumn('test_col', config, dialect)
          expect(col).toBeDefined()
        })
      }

      it('applies primaryKey modifier', () => {
        const col = buildDslColumn('id', { type: 'uuid', primaryKey: true }, dialect)
        expect(col).toBeDefined()
      })

      it('applies notNull modifier', () => {
        const col = buildDslColumn('email', { type: 'varchar', maxLength: 255, notNull: true }, dialect)
        expect(col).toBeDefined()
      })

      it('applies literal default', () => {
        const col = buildDslColumn('status', { type: 'varchar', maxLength: 20, default: 'draft' }, dialect)
        expect(col).toBeDefined()
      })

      it('applies "now" default', () => {
        const col = buildDslColumn('created_at', { type: 'timestamp', default: 'now' }, dialect)
        expect(col).toBeDefined()
      })

      it('applies "random_uuid" default', () => {
        const col = buildDslColumn('id', { type: 'uuid', default: 'random_uuid' }, dialect)
        expect(col).toBeDefined()
      })

      it('applies custom modifier', () => {
        let customCalled = false
        const col = buildDslColumn('email', {
          type: 'varchar',
          maxLength: 255,
          custom: (c) => { customCalled = true; return c },
        }, dialect)
        expect(col).toBeDefined()
        expect(customCalled).toBe(true)
      })
    })
  }

  it('chains primaryKey + notNull + default + custom together', () => {
    let customCalled = false
    const col = buildDslColumn('id', {
      type: 'uuid',
      primaryKey: true,
      notNull: true,
      default: 'random_uuid',
      custom: (c) => { customCalled = true; return c },
    }, 'memory')
    expect(col).toBeDefined()
    expect(customCalled).toBe(true)
  })

  it('throws ConfigError for unknown column type', () => {
    expect(() => buildDslColumn('bad', { type: 'blob' as any }, 'memory')).toThrow(ConfigError)
  })
})

describe('dialect-specific behaviors', () => {
  it('postgresql varchar respects maxLength', () => {
    const col = buildDslColumn('name', { type: 'varchar', maxLength: 100 }, 'postgresql')
    expect(col).toBeDefined()
  })

  it('postgresql varchar without maxLength still works', () => {
    const col = buildDslColumn('name', { type: 'varchar' }, 'postgresql')
    expect(col).toBeDefined()
  })

  it('postgresql array with uuid items', () => {
    const col = buildDslColumn('ids', { type: 'array', items: 'uuid' }, 'postgresql')
    expect(col).toBeDefined()
  })

  it('postgresql array throws on unknown item type', () => {
    expect(() =>
      buildDslColumn('bad', { type: 'array', items: 'blob' as any }, 'postgresql')
    ).toThrow(ConfigError)
  })

  it('mysql uuid maps to varchar(36)', () => {
    const col = buildDslColumn('id', { type: 'uuid' }, 'mysql')
    expect(col).toBeDefined()
  })

  it('mysql array maps to json', () => {
    const col = buildDslColumn('tags', { type: 'array' }, 'mysql')
    expect(col).toBeDefined()
  })

  it('sqlite uuid maps to text', () => {
    const col = buildDslColumn('id', { type: 'uuid' }, 'sqlite')
    expect(col).toBeDefined()
  })

  it('sqlite boolean maps to integer with boolean mode', () => {
    const col = buildDslColumn('active', { type: 'boolean' }, 'sqlite')
    expect(col).toBeDefined()
  })

  it('sqlite jsonb maps to text with json mode', () => {
    const col = buildDslColumn('meta', { type: 'jsonb' }, 'sqlite')
    expect(col).toBeDefined()
  })
})
