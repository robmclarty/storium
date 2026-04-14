import { describe, it, expect } from 'vitest'
import { createPrepFn } from '../prep'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import type { ColumnAnnotations, TableAccess } from '../../types'

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email', { length: 255 }).notNull(),
  name: text('name', { length: 255 }),
})

const annotations: ColumnAnnotations = {
  email: {
    required: true,
    transform: (v) => (v as string).trim().toLowerCase(),
    validate: (v, test) => {
      test(v, 'not_empty', 'Email cannot be empty')
    },
  },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name'],
  writable: ['email', 'name'],
  hidden: [],
  readonly: ['id'],
}

describe('prep pipeline', () => {
  const prep = createPrepFn(usersTable, annotations, access)

  /* QA-10222 */ it('[QA-10222] filters unknown keys from input', async () => {
    const result = await prep(
      { email: 'alice@example.com', unknown: 'ignored' },
      { validateRequired: false }
    )

    expect(result).not.toHaveProperty('unknown')
  })

  /* QA-10223 */ it('[QA-10223] transforms values through column transform functions', async () => {
    const result = await prep(
      { email: '  ALICE@Example.COM  ' },
      { validateRequired: false }
    )

    expect(result.email).toBe('alice@example.com')
  })

  /* QA-10224 */ it('[QA-10224] rejects invalid types', async () => {
    await expect(
      prep({ email: 123 }, { validateRequired: false })
    ).rejects.toThrow()
  })

  /* QA-10225 */ it('[QA-10225] enforces required fields when validateRequired is true', async () => {
    await expect(
      prep({ name: 'Alice' }, { validateRequired: true })
    ).rejects.toThrow()
  })

  /* QA-10226 */ it('[QA-10226] skips required check when validateRequired is false', async () => {
    const result = await prep(
      { name: 'Alice' },
      { validateRequired: false }
    )

    expect(result).toEqual({ name: 'Alice' })
  })

  /* QA-10227 */ it('[QA-10227] passes input through raw when skipPrep is true', async () => {
    const raw = { anything: 'goes', foo: 42 }
    const result = await prep(raw, { skipPrep: true })

    expect(result).toBe(raw)
  })

  /* QA-10228 */ it('[QA-10228] resolves Promise values in input (Stage 0)', async () => {
    const result = await prep(
      { email: Promise.resolve('async@example.com') },
      { validateRequired: true }
    )

    expect(result.email).toBe('async@example.com')
  })

  /* QA-10229 */ it('[QA-10229] strips non-writable columns when onlyWritable is true', async () => {
    const result = await prep(
      { id: 'should-be-removed', email: 'test@example.com' },
      { validateRequired: false, onlyWritable: true }
    )

    expect(result).not.toHaveProperty('id')
    expect(result).toHaveProperty('email')
  })

  /* QA-10230 */ it('[QA-10230] accumulates multiple validation errors in a single throw', async () => {
    const plainTable = sqliteTable('plain_prep', {
      a: text('a', { length: 255 }),
      b: integer('b'),
    })
    const plainAnnotations: ColumnAnnotations = {}
    const plainAccess: TableAccess = {
      selectable: ['a', 'b'],
      writable: ['a', 'b'],
      hidden: [],
      readonly: [],
    }
    const plainPrep = createPrepFn(plainTable, plainAnnotations, plainAccess)
    const { ValidationError } = await import('../../errors')

    try {
      await plainPrep(
        { a: 123, b: 'not-a-number' },
        { validateRequired: false }
      )
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.errors.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('async transforms', () => {
  /* QA-10231 */ it('[QA-10231] resolves async transform functions', async () => {
    const asyncTable = sqliteTable('async_t', {
      email: text('email', { length: 255 }).notNull(),
    })
    const asyncAnnotations: ColumnAnnotations = {
      email: {
        required: true,
        transform: async (v) => {
          // Simulate async operation (e.g., hash)
          return (v as string).toLowerCase()
        },
      },
    }
    const asyncAccess: TableAccess = {
      selectable: ['email'],
      writable: ['email'],
      hidden: [],
      readonly: [],
    }
    const prep = createPrepFn(asyncTable, asyncAnnotations, asyncAccess)
    const result = await prep({ email: 'HELLO@TEST.COM' }, { validateRequired: true })
    expect(result.email).toBe('hello@test.com')
  })

  /* QA-10232 */ it('[QA-10232] catches throwing transforms and wraps in ValidationError', async () => {
    const throwTable = sqliteTable('throw_t', {
      val: text('val', { length: 255 }),
    })
    const throwAnnotations: ColumnAnnotations = {
      val: {
        transform: () => { throw new Error('transform boom') },
      },
    }
    const throwAccess: TableAccess = {
      selectable: ['val'],
      writable: ['val'],
      hidden: [],
      readonly: [],
    }
    const prep = createPrepFn(throwTable, throwAnnotations, throwAccess)
    const { ValidationError } = await import('../../errors')

    try {
      await prep({ val: 'test' }, { validateRequired: false })
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.errors[0].field).toBe('val')
      expect(err.errors[0].message).toContain('transform boom')
    }
  })

  /* QA-10233 */ it('[QA-10233] catches async transform rejections', async () => {
    const rejectTable = sqliteTable('reject_t', {
      val: text('val', { length: 255 }),
    })
    const rejectAnnotations: ColumnAnnotations = {
      val: {
        transform: async () => { throw new Error('async boom') },
      },
    }
    const rejectAccess: TableAccess = {
      selectable: ['val'],
      writable: ['val'],
      hidden: [],
      readonly: [],
    }
    const prep = createPrepFn(rejectTable, rejectAnnotations, rejectAccess)
    const { ValidationError } = await import('../../errors')

    try {
      await prep({ val: 'test' }, { validateRequired: false })
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.errors[0].message).toContain('async boom')
    }
  })
})

describe('notNull enforcement', () => {
  /* QA-10234 */ it('[QA-10234] enforces notNull columns without hasDefault as required', async () => {
    const strictTable = sqliteTable('strict_t', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      required_col: text('required_col').notNull(),
      optional_col: text('optional_col'),
    })
    const strictAccess: TableAccess = {
      selectable: ['id', 'required_col', 'optional_col'],
      writable: ['required_col', 'optional_col'],
      hidden: [],
      readonly: ['id'],
    }
    const prep = createPrepFn(strictTable, {}, strictAccess)
    const { ValidationError } = await import('../../errors')

    // Should throw because required_col is notNull without a default
    try {
      await prep({ optional_col: 'ok' }, { validateRequired: true })
      expect.fail('should have thrown')
    } catch (err: any) {
      expect(err).toBeInstanceOf(ValidationError)
      expect(err.errors.some((e: any) => e.field === 'required_col')).toBe(true)
    }
  })
})

describe('prep with custom assertions', () => {
  const slugTable = sqliteTable('slugs', {
    slug: text('slug', { length: 255 }).notNull(),
  })

  const slugAnnotations: ColumnAnnotations = {
    slug: {
      required: true,
      validate: (v, test) => {
        test(v, 'is_slug', 'Must be a valid slug')
      },
    },
  }

  const slugAccess: TableAccess = {
    selectable: ['slug'],
    writable: ['slug'],
    hidden: [],
    readonly: [],
  }

  /* QA-10235 */ it('[QA-10235] uses custom assertions from the registry', async () => {
    const prep = createPrepFn(slugTable, slugAnnotations, slugAccess, {
      is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
    })

    const result = await prep({ slug: 'valid-slug' }, { validateRequired: true })
    expect(result.slug).toBe('valid-slug')
  })

  /* QA-10236 */ it('[QA-10236] rejects values that fail custom assertions', async () => {
    const prep = createPrepFn(slugTable, slugAnnotations, slugAccess, {
      is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
    })

    await expect(
      prep({ slug: 'INVALID SLUG' }, { validateRequired: true })
    ).rejects.toThrow()
  })
})
