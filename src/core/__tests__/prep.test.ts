import { describe, it, expect } from 'vitest'
import { createPrepFn } from '../prep'
import type { ColumnsConfig, TableAccess } from '../types'

const columns: ColumnsConfig = {
  id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
  email: {
    type: 'varchar',
    maxLength: 255,
    required: true,
    transform: (v: string) => v.trim().toLowerCase(),
    validate: (v, test) => {
      test(v, 'not_empty', 'Email cannot be empty')
    },
  },
  name: { type: 'varchar', maxLength: 255 },
}

const access: TableAccess = {
  selectable: ['id', 'email', 'name'],
  writable: ['email', 'name'],
  hidden: [],
  readonly: ['id'],
}

describe('prep pipeline', () => {
  const prep = createPrepFn(columns, access)

  it('filters unknown keys from input', async () => {
    const result = await prep(
      { email: 'alice@example.com', unknown: 'ignored' },
      { validateRequired: false }
    )

    expect(result).not.toHaveProperty('unknown')
  })

  it('transforms values through column transform functions', async () => {
    const result = await prep(
      { email: '  ALICE@Example.COM  ' },
      { validateRequired: false }
    )

    expect(result.email).toBe('alice@example.com')
  })

  it('rejects invalid types', async () => {
    await expect(
      prep({ email: 123 }, { validateRequired: false })
    ).rejects.toThrow()
  })

  it('enforces required fields when validateRequired is true', async () => {
    await expect(
      prep({ name: 'Alice' }, { validateRequired: true })
    ).rejects.toThrow()
  })

  it('skips required check when validateRequired is false', async () => {
    const result = await prep(
      { name: 'Alice' },
      { validateRequired: false }
    )

    expect(result).toEqual({ name: 'Alice' })
  })

  it('passes input through raw when force is true', async () => {
    const raw = { anything: 'goes', foo: 42 }
    const result = await prep(raw, { force: true })

    expect(result).toBe(raw)
  })

  it('resolves Promise values in input (Stage 0)', async () => {
    const result = await prep(
      { email: Promise.resolve('async@example.com') },
      { validateRequired: true }
    )

    expect(result.email).toBe('async@example.com')
  })

  it('strips non-writable columns when onlyWritable is true', async () => {
    const result = await prep(
      { id: 'should-be-removed', email: 'test@example.com' },
      { validateRequired: false, onlyWritable: true }
    )

    expect(result).not.toHaveProperty('id')
    expect(result).toHaveProperty('email')
  })

  it('accumulates multiple validation errors in a single throw', async () => {
    // Use columns without transforms so type checks run and accumulate
    const plainColumns: ColumnsConfig = {
      a: { type: 'varchar', maxLength: 255 },
      b: { type: 'integer' },
    }
    const plainAccess: TableAccess = {
      selectable: ['a', 'b'],
      writable: ['a', 'b'],
      hidden: [],
      readonly: [],
    }
    const plainPrep = createPrepFn(plainColumns, plainAccess)
    const { ValidationError } = await import('../errors')

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

describe('prep with custom assertions', () => {
  const colsWithValidate: ColumnsConfig = {
    slug: {
      type: 'varchar',
      maxLength: 255,
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

  it('uses custom assertions from the registry', async () => {
    const prep = createPrepFn(colsWithValidate, slugAccess, {
      is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
    })

    const result = await prep({ slug: 'valid-slug' }, { validateRequired: true })
    expect(result.slug).toBe('valid-slug')
  })

  it('rejects values that fail custom assertions', async () => {
    const prep = createPrepFn(colsWithValidate, slugAccess, {
      is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
    })

    await expect(
      prep({ slug: 'INVALID SLUG' }, { validateRequired: true })
    ).rejects.toThrow()
  })
})
