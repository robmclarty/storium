import { describe, it, expect } from 'vitest'
import { buildJsonSchemas } from '../json'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import type { ColumnAnnotations, TableAccess } from '../../types'

/**
 * SQLite has a limited type system compared to PostgreSQL. We test the
 * JSON Schema generation with the types available in SQLite, which covers
 * the core mapping logic (string, integer, real/number, boolean-as-integer).
 */
const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email', { length: 255 }).notNull(),
  name: text('name', { length: 100 }),
  age: integer('age'),
  score: real('score'),
  bio: text('bio'),
  active: integer('active', { mode: 'boolean' }),
  created_at: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

const annotations: ColumnAnnotations = {
  email: { required: true },
  created_at: { readonly: true },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name', 'age', 'score', 'bio', 'active', 'created_at'],
  writable: ['email', 'name', 'age', 'score', 'bio', 'active'],
  hidden: [],
  readonly: ['id', 'created_at'],
}

describe('buildJsonSchemas', () => {
  const schemas = buildJsonSchemas(usersTable, annotations, access)

  describe('DSL type mapping', () => {
    const schema = schemas.createSchema()

    it('maps text with length to string with maxLength', () => {
      expect(schema.properties.email).toEqual({ type: 'string', maxLength: 255 })
    })

    it('maps text without length to string', () => {
      expect(schema.properties.bio).toEqual({ type: 'string' })
    })

    it('maps integer to integer', () => {
      expect(schema.properties.age).toEqual({ type: 'integer' })
    })

    it('maps real to number', () => {
      expect(schema.properties.score).toEqual({ type: 'number' })
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

  describe('fullSchema variant', () => {
    const schema = schemas.fullSchema()

    it('includes all columns', () => {
      expect(Object.keys(schema.properties)).toContain('id')
      expect(Object.keys(schema.properties)).toContain('email')
      expect(Object.keys(schema.properties)).toContain('created_at')
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
