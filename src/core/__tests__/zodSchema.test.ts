import { describe, it, expect } from 'vitest'
import { buildZodSchemas } from '../zodSchema'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, notNull: true, default: 'random_uuid' },
  email: {
    type: 'varchar',
    maxLength: 10,
    required: true,
    transform: (v: string) => v.trim().toLowerCase(),
  },
  name: { type: 'varchar', maxLength: 255 },
  age: { type: 'integer' },
  active: { type: 'boolean' },
  bio: { type: 'text' },
  score: { type: 'real' },
  raw_col: { raw: () => null },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name', 'age', 'active', 'bio', 'score'],
  writable: ['email', 'name', 'age', 'active', 'bio', 'score', 'raw_col'],
  hidden: [],
  readonly: ['id'],
}

describe('buildZodSchemas', () => {
  const schemas = buildZodSchemas(columns, access)

  describe('createSchema', () => {
    it('accepts valid input with required fields', () => {
      const result = schemas.createSchema.safeParse({ email: 'hi@x.com' })
      expect(result.success).toBe(true)
    })

    it('rejects missing required fields', () => {
      const result = schemas.createSchema.safeParse({ name: 'Alice' })
      expect(result.success).toBe(false)
    })

    it('applies transform functions', () => {
      const result = schemas.createSchema.safeParse({ email: ' HI@X.COM' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('hi@x.com')
      }
    })

    it('enforces varchar maxLength', () => {
      const result = schemas.createSchema.safeParse({ email: 'a'.repeat(20) })
      expect(result.success).toBe(false)
    })

    it('accepts optional fields when omitted', () => {
      const result = schemas.createSchema.safeParse({ email: 'hi@x.com' })
      expect(result.success).toBe(true)
    })
  })

  describe('updateSchema', () => {
    it('makes all fields optional', () => {
      const result = schemas.updateSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('validates provided fields', () => {
      const result = schemas.updateSchema.safeParse({ age: 'not a number' })
      expect(result.success).toBe(false)
    })
  })

  describe('selectSchema', () => {
    it('validates output data types', () => {
      const result = schemas.selectSchema.safeParse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'a@b.com',
        name: 'Alice',
        age: 30,
        active: true,
        bio: 'hello',
        score: 3.14,
      })
      expect(result.success).toBe(true)
    })
  })

  describe('type validation', () => {
    it('rejects wrong type for integer', () => {
      const result = schemas.createSchema.safeParse({ email: 'a@b.com', age: 'thirty' })
      expect(result.success).toBe(false)
    })

    it('rejects wrong type for boolean', () => {
      const result = schemas.createSchema.safeParse({ email: 'a@b.com', active: 'yes' })
      expect(result.success).toBe(false)
    })
  })

  describe('raw columns', () => {
    it('accepts any value for raw columns', () => {
      const result = schemas.createSchema.safeParse({ email: 'a@b.com', raw_col: { anything: true } })
      expect(result.success).toBe(true)
    })
  })
})

describe('validate callbacks', () => {
  it('accumulates errors from validate callbacks via superRefine', () => {
    const cols: ColumnsConfig = {
      slug: {
        type: 'varchar',
        maxLength: 255,
        required: true,
        validate: (v, test) => {
          test(v, (val: any) => /^[a-z0-9-]+$/.test(val), 'Must be a valid slug')
        },
      },
    }
    const acc: TableAccess = {
      selectable: ['slug'],
      writable: ['slug'],
      hidden: [],
      readonly: [],
    }
    const schemas = buildZodSchemas(cols, acc)
    const result = schemas.createSchema.safeParse({ slug: 'INVALID SLUG' })
    expect(result.success).toBe(false)
  })
})
