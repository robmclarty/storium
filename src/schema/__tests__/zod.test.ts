import { describe, it, expect } from 'vitest'
import { buildZodSchemas } from '../zod'
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import type { ColumnAnnotations, TableAccess } from '../../types'

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email', { length: 10 }).notNull(),
  name: text('name', { length: 255 }),
  age: integer('age'),
  active: integer('active', { mode: 'boolean' }),
  bio: text('bio'),
  score: real('score'),
})

const annotations: ColumnAnnotations = {
  email: {
    required: true,
    transform: (v) => (v as string).trim().toLowerCase(),
  },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name', 'age', 'active', 'bio', 'score'],
  writable: ['email', 'name', 'age', 'active', 'bio', 'score'],
  hidden: [],
  readonly: ['id'],
}

describe('buildZodSchemas', () => {
  const schemas = buildZodSchemas(usersTable, annotations, access)

  describe('createSchema', () => {
    /* QA-10155 */ it('[QA-10155] accepts valid input with required fields', () => {
      const result = schemas.createSchema.safeParse({ email: 'hi@x.com' })
      expect(result.success).toBe(true)
    })

    /* QA-10156 */ it('[QA-10156] rejects missing required fields', () => {
      const result = schemas.createSchema.safeParse({ name: 'Alice' })
      expect(result.success).toBe(false)
    })

    /* QA-10157 */ it('[QA-10157] does not apply transforms (transforms are handled by the prep pipeline)', () => {
      const result = schemas.createSchema.safeParse({ email: ' HI@X.COM' })
      expect(result.success).toBe(true)
      if (result.success) {
        // Zod schemas validate shape/types only — transforms run in prep, not here
        expect((result.data as any).email).toBe(' HI@X.COM')
      }
    })

    /* QA-10158 */ it('[QA-10158] enforces varchar maxLength', () => {
      const result = schemas.createSchema.safeParse({ email: 'a'.repeat(20) })
      expect(result.success).toBe(false)
    })

    /* QA-10159 */ it('[QA-10159] accepts optional fields when omitted', () => {
      const result = schemas.createSchema.safeParse({ email: 'hi@x.com' })
      expect(result.success).toBe(true)
    })
  })

  describe('updateSchema', () => {
    /* QA-10160 */ it('[QA-10160] makes all fields optional', () => {
      const result = schemas.updateSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    /* QA-10161 */ it('[QA-10161] validates provided fields', () => {
      const result = schemas.updateSchema.safeParse({ age: 'not a number' })
      expect(result.success).toBe(false)
    })
  })

  describe('selectSchema', () => {
    /* QA-10162 */ it('[QA-10162] validates output data types', () => {
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
    /* QA-10163 */ it('[QA-10163] rejects wrong type for integer', () => {
      const result = schemas.createSchema.safeParse({ email: 'a@b.com', age: 'thirty' })
      expect(result.success).toBe(false)
    })

    /* QA-10164 */ it('[QA-10164] rejects wrong type for boolean', () => {
      const result = schemas.createSchema.safeParse({ email: 'a@b.com', active: 'yes' })
      expect(result.success).toBe(false)
    })
  })
})

describe('validate callbacks', () => {
  /* QA-10165 */ it('[QA-10165] accumulates errors from validate callbacks via superRefine', () => {
    const table = sqliteTable('slug_table', {
      slug: text('slug', { length: 255 }).notNull(),
    })

    const slugAnnotations: ColumnAnnotations = {
      slug: {
        required: true,
        validate: (v, test) => {
          test(v, (val: any) => /^[a-z0-9-]+$/.test(val), 'Must be a valid slug')
        },
      },
    }
    const slugAccess: TableAccess = {
      selectable: ['slug'],
      writable: ['slug'],
      hidden: [],
      readonly: [],
    }

    const schemas = buildZodSchemas(table, slugAnnotations, slugAccess)
    const result = schemas.createSchema.safeParse({ slug: 'INVALID SLUG' })
    expect(result.success).toBe(false)
  })
})
