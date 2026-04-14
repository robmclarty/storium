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

    /* QA-10131 */ it('[QA-10131] maps text with length to string with maxLength', () => {
      expect(schema.properties.email).toEqual({ type: 'string', maxLength: 255 })
    })

    /* QA-10132 */ it('[QA-10132] maps text without length to string', () => {
      expect(schema.properties.bio).toEqual({ type: 'string' })
    })

    /* QA-10133 */ it('[QA-10133] maps integer to integer', () => {
      expect(schema.properties.age).toEqual({ type: 'integer' })
    })

    /* QA-10134 */ it('[QA-10134] maps real to number', () => {
      expect(schema.properties.score).toEqual({ type: 'number' })
    })
  })

  describe('selectSchema variant', () => {
    const schema = schemas.selectSchema()

    /* QA-10135 */ it('[QA-10135] marks notNull columns as required', () => {
      expect(schema.required).toContain('id')
      expect(schema.required).toContain('email')
      expect(schema.required).toContain('created_at')
    })
  })

  describe('createSchema variant', () => {
    const schema = schemas.createSchema()

    /* QA-10136 */ it('[QA-10136] includes required fields', () => {
      expect(schema.required).toContain('email')
    })

    /* QA-10137 */ it('[QA-10137] sets additionalProperties to false by default', () => {
      expect(schema.additionalProperties).toBe(false)
    })

    /* QA-10138 */ it('[QA-10138] respects additionalProperties option', () => {
      const permissive = schemas.createSchema({ additionalProperties: true })
      expect(permissive.additionalProperties).toBe(true)
    })
  })

  describe('updateSchema variant', () => {
    const schema = schemas.updateSchema()

    /* QA-10139 */ it('[QA-10139] has no required fields', () => {
      expect(schema.required).toBeUndefined()
    })
  })

  describe('fullSchema variant', () => {
    const schema = schemas.fullSchema()

    /* QA-10140 */ it('[QA-10140] includes all columns', () => {
      expect(Object.keys(schema.properties)).toContain('id')
      expect(Object.keys(schema.properties)).toContain('email')
      expect(Object.keys(schema.properties)).toContain('created_at')
    })
  })

  describe('extended options', () => {
    /* QA-10141 */ it('[QA-10141] merges extra properties into the schema', () => {
      const schema = schemas.createSchema({
        properties: { invite_code: { type: 'string', minLength: 8 } },
      })
      expect(schema.properties.invite_code).toEqual({ type: 'string', minLength: 8 })
      expect(schema.properties.email).toBeDefined()
    })

    /* QA-10142 */ it('[QA-10142] appends extra required fields', () => {
      const schema = schemas.createSchema({
        required: ['invite_code'],
      })
      expect(schema.required).toContain('email')
      expect(schema.required).toContain('invite_code')
    })

    /* QA-10143 */ it('[QA-10143] sets title on the schema', () => {
      const schema = schemas.createSchema({ title: 'CreateUser' })
      expect(schema.title).toBe('CreateUser')
    })

    /* QA-10144 */ it('[QA-10144] sets description on the schema', () => {
      const schema = schemas.createSchema({ description: 'Create a new user' })
      expect(schema.description).toBe('Create a new user')
    })

    /* QA-10145 */ it('[QA-10145] sets $id on the schema', () => {
      const schema = schemas.createSchema({ $id: 'User' })
      expect(schema.$id).toBe('User')
    })

    /* QA-10146 */ it('[QA-10146] omits title/description/$id when not provided', () => {
      const schema = schemas.createSchema()
      expect(schema.title).toBeUndefined()
      expect(schema.description).toBeUndefined()
      expect(schema.$id).toBeUndefined()
    })
  })
})
