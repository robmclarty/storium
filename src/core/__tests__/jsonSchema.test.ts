import { describe, it, expect } from 'vitest'
import { buildJsonSchemas } from '../jsonSchema'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, notNull: true, default: 'uuid:v4' },
  email: { type: 'varchar', maxLength: 255, required: true, notNull: true },
  name: { type: 'varchar', maxLength: 100 },
  age: { type: 'integer' },
  score: { type: 'real' },
  bio: { type: 'text' },
  active: { type: 'boolean' },
  created_at: { type: 'timestamp', notNull: true, default: 'now', readonly: true },
  birthday: { type: 'date' },
  metadata: { type: 'jsonb' },
  counter: { type: 'bigint' },
  tags: { type: 'array', items: 'text' },
  raw_col: { raw: () => null },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name', 'age', 'score', 'bio', 'active', 'created_at', 'birthday', 'metadata', 'counter', 'tags', 'raw_col'],
  writable: ['email', 'name', 'age', 'score', 'bio', 'active', 'birthday', 'metadata', 'counter', 'tags', 'raw_col'],
  hidden: [],
  readonly: ['id', 'created_at'],
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

  describe('extended options', () => {
    it('merges extra properties into the schema', () => {
      const schema = schemas.createSchema({
        properties: { invite_code: { type: 'string', minLength: 8 } },
      })
      expect(schema.properties.invite_code).toEqual({ type: 'string', minLength: 8 })
      expect(schema.properties.email).toBeDefined()
    })

    it('appends extra required fields', () => {
      const schema = schemas.createSchema({
        required: ['invite_code'],
      })
      expect(schema.required).toContain('email')
      expect(schema.required).toContain('invite_code')
    })

    it('sets title on the schema', () => {
      const schema = schemas.createSchema({ title: 'CreateUser' })
      expect(schema.title).toBe('CreateUser')
    })

    it('sets description on the schema', () => {
      const schema = schemas.createSchema({ description: 'Create a new user' })
      expect(schema.description).toBe('Create a new user')
    })

    it('sets $id on the schema', () => {
      const schema = schemas.createSchema({ $id: 'User' })
      expect(schema.$id).toBe('User')
    })

    it('omits title/description/$id when not provided', () => {
      const schema = schemas.createSchema()
      expect(schema.title).toBeUndefined()
      expect(schema.description).toBeUndefined()
      expect(schema.$id).toBeUndefined()
    })
  })
})
