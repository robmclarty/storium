import { describe, it, expect } from 'vitest'
import { buildSchemaSet } from '../runtimeSchema'
import { ValidationError } from '../errors'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, notNull: true, default: 'uuid:v4' },
  email: { type: 'varchar', maxLength: 255, required: true, notNull: true },
  name: { type: 'varchar', maxLength: 255 },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name'],
  writable: ['email', 'name'],
  hidden: [],
  readonly: ['id'],
}

describe('buildSchemaSet', () => {
  const schemas = buildSchemaSet(columns, access)

  it('produces all 4 schema variants', () => {
    expect(schemas).toHaveProperty('createSchema')
    expect(schemas).toHaveProperty('updateSchema')
    expect(schemas).toHaveProperty('selectSchema')
    expect(schemas).toHaveProperty('fullSchema')
  })

  describe('validate()', () => {
    it('returns data on valid input', () => {
      const result = schemas.createSchema.validate({ email: 'alice@example.com' })
      expect(result).toHaveProperty('email', 'alice@example.com')
    })

    it('throws ValidationError on invalid input', () => {
      expect(() => schemas.createSchema.validate({})).toThrow(ValidationError)
    })
  })

  describe('tryValidate()', () => {
    it('returns success: true with data on valid input', () => {
      const result = schemas.createSchema.tryValidate({ email: 'alice@example.com' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toHaveProperty('email')
      }
    })

    it('returns success: false with errors on invalid input', () => {
      const result = schemas.createSchema.tryValidate({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors[0]).toHaveProperty('field')
        expect(result.errors[0]).toHaveProperty('message')
      }
    })
  })

  describe('toJsonSchema()', () => {
    it('returns a JSON Schema object', () => {
      const jsonSchema = schemas.createSchema.toJsonSchema()
      expect(jsonSchema).toHaveProperty('type', 'object')
      expect(jsonSchema).toHaveProperty('properties')
      expect(jsonSchema.properties).toHaveProperty('email')
    })

    it('respects additionalProperties option', () => {
      const permissive = schemas.createSchema.toJsonSchema({ additionalProperties: true })
      expect(permissive.additionalProperties).toBe(true)
    })
  })

  describe('.zod', () => {
    it('exposes the underlying Zod schema', () => {
      expect(schemas.createSchema.zod).toBeDefined()
      expect(typeof schemas.createSchema.zod.safeParse).toBe('function')
    })
  })
})
