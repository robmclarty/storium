import { describe, it, expect } from 'vitest'
import { buildJsonSchemas } from '../jsonSchema'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, notNull: true, default: 'random_uuid' },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true, notNull: true },
  name: { type: 'varchar', maxLength: 100, mutable: true },
  age: { type: 'integer', mutable: true },
  score: { type: 'real', mutable: true },
  bio: { type: 'text', mutable: true },
  active: { type: 'boolean', mutable: true },
  created_at: { type: 'timestamp', notNull: true, default: 'now' },
  birthday: { type: 'date', mutable: true },
  metadata: { type: 'jsonb', mutable: true },
  counter: { type: 'bigint', mutable: true },
  tags: { type: 'array', items: 'text', mutable: true },
  raw_col: { raw: () => null, mutable: true },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name', 'age', 'score', 'bio', 'active', 'created_at', 'birthday', 'metadata', 'counter', 'tags', 'raw_col'],
  mutable: ['email', 'name', 'age', 'score', 'bio', 'active', 'birthday', 'metadata', 'counter', 'tags', 'raw_col'],
  insertable: ['email', 'name', 'age', 'score', 'bio', 'active', 'birthday', 'metadata', 'counter', 'tags', 'raw_col'],
  writeOnly: [],
}

describe('buildJsonSchemas', () => {
  const schemas = buildJsonSchemas(columns, access)

  describe('DSL type mapping', () => {
    const schema = schemas.createSchema()

    it('maps uuid to string with format uuid', () => {
      const select = schemas.selectSchema()
      expect(select.properties.id).toEqual({ type: 'string', format: 'uuid' })
    })

    it('maps varchar to string with maxLength', () => {
      expect(schema.properties.email).toEqual({ type: 'string', maxLength: 255 })
    })

    it('maps text to string', () => {
      expect(schema.properties.bio).toEqual({ type: 'string' })
    })

    it('maps integer to integer', () => {
      expect(schema.properties.age).toEqual({ type: 'integer' })
    })

    it('maps real to number', () => {
      expect(schema.properties.score).toEqual({ type: 'number' })
    })

    it('maps boolean to boolean', () => {
      expect(schema.properties.active).toEqual({ type: 'boolean' })
    })

    it('maps timestamp to string with format date-time', () => {
      const select = schemas.selectSchema()
      expect(select.properties.created_at).toEqual({ type: 'string', format: 'date-time' })
    })

    it('maps date to string with format date', () => {
      expect(schema.properties.birthday).toEqual({ type: 'string', format: 'date' })
    })

    it('maps jsonb to object', () => {
      expect(schema.properties.metadata).toEqual({ type: 'object' })
    })

    it('maps bigint to string with format int64', () => {
      expect(schema.properties.counter).toEqual({ type: 'string', format: 'int64' })
    })

    it('maps array to array with items', () => {
      expect(schema.properties.tags.type).toBe('array')
      expect(schema.properties.tags.items).toBeDefined()
    })

    it('maps raw columns to permissive empty object', () => {
      expect(schema.properties.raw_col).toEqual({})
    })
  })

  describe('createSchema variant', () => {
    const schema = schemas.createSchema()

    it('includes required fields', () => {
      expect(schema.required).toContain('email')
    })

    it('sets additionalProperties to false by default', () => {
      expect(schema.additionalProperties).toBe(false)
    })

    it('respects additionalProperties option', () => {
      const permissive = schemas.createSchema({ additionalProperties: true })
      expect(permissive.additionalProperties).toBe(true)
    })
  })

  describe('updateSchema variant', () => {
    const schema = schemas.updateSchema()

    it('has no required fields', () => {
      expect(schema.required).toBeUndefined()
    })
  })

  describe('selectSchema variant', () => {
    const schema = schemas.selectSchema()

    it('marks notNull columns as required', () => {
      expect(schema.required).toContain('id')
      expect(schema.required).toContain('email')
      expect(schema.required).toContain('created_at')
    })
  })

  describe('fullSchema variant', () => {
    const schema = schemas.fullSchema()

    it('includes all columns', () => {
      expect(Object.keys(schema.properties)).toContain('id')
      expect(Object.keys(schema.properties)).toContain('email')
      expect(Object.keys(schema.properties)).toContain('raw_col')
    })
  })
})
