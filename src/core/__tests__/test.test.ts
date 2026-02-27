import { describe, it, expect, afterEach } from 'vitest'
import { createTestFn, createAssertionRegistry, BUILTIN_ASSERTIONS } from '../test'

describe('built-in assertions', () => {
  const errors: Array<{ field: string; message: string }> = []
  const test = createTestFn('value', errors)

  afterEach(() => { errors.length = 0 })

  it('is_email accepts valid emails', () => {
    test('alice@example.com', 'is_email')
    expect(errors).toHaveLength(0)
  })

  it('is_email rejects invalid emails', () => {
    test('not-an-email', 'is_email')
    expect(errors).toHaveLength(1)
  })

  it('is_url accepts http and https URLs', () => {
    test('https://example.com', 'is_url')
    test('http://example.com/path', 'is_url')
    expect(errors).toHaveLength(0)
  })

  it('is_url rejects non-URLs', () => {
    test('example.com', 'is_url')
    expect(errors).toHaveLength(1)
  })

  it('is_numeric accepts numbers and numeric strings', () => {
    test(42, 'is_numeric')
    test('3.14', 'is_numeric')
    expect(errors).toHaveLength(0)
  })

  it('is_numeric rejects non-numeric values', () => {
    test('abc', 'is_numeric')
    expect(errors).toHaveLength(1)
  })

  it('is_uuid accepts valid UUIDs', () => {
    test('550e8400-e29b-41d4-a716-446655440000', 'is_uuid')
    expect(errors).toHaveLength(0)
  })

  it('is_uuid rejects invalid UUIDs', () => {
    test('not-a-uuid', 'is_uuid')
    expect(errors).toHaveLength(1)
  })

  it('is_boolean accepts true and false', () => {
    test(true, 'is_boolean')
    test(false, 'is_boolean')
    expect(errors).toHaveLength(0)
  })

  it('is_boolean rejects non-boolean values', () => {
    test(1, 'is_boolean')
    expect(errors).toHaveLength(1)
  })

  it('is_integer accepts whole numbers', () => {
    test(42, 'is_integer')
    expect(errors).toHaveLength(0)
  })

  it('is_integer rejects floats', () => {
    test(3.14, 'is_integer')
    expect(errors).toHaveLength(1)
  })

  it('not_empty accepts non-empty values', () => {
    test('hello', 'not_empty')
    test(0, 'not_empty')
    expect(errors).toHaveLength(0)
  })

  it('not_empty rejects empty strings, null, undefined', () => {
    test('', 'not_empty')
    test(null, 'not_empty')
    test(undefined, 'not_empty')
    test('   ', 'not_empty')
    expect(errors).toHaveLength(4)
  })
})

describe('createTestFn', () => {
  it('pushes error for unregistered named assertion', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('value', 'does_not_exist')
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('does_not_exist')
    expect(errors[0].message).toContain('does_not_exist')
  })

  it('supports inline function assertions', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('age', errors)
    test(25, (v: any) => v >= 18)
    expect(errors).toHaveLength(0)
    test(10, (v: any) => v >= 18)
    expect(errors).toHaveLength(1)
  })

  it('uses custom error string when provided', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('bad', 'is_email', 'Must be a valid email')
    expect(errors[0].message).toBe('Must be a valid email')
  })

  it('uses custom error callback when provided', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('bad', 'is_email', (defaultMsg) => `Custom: ${defaultMsg}`)
    expect(errors[0].message).toMatch(/^Custom:/)
  })

  it('uses custom assertions from registry', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('slug', errors, {
      is_slug: (v) => typeof v === 'string' && /^[a-z0-9-]+$/.test(v),
    })
    test('valid-slug', 'is_slug')
    expect(errors).toHaveLength(0)
    test('INVALID SLUG', 'is_slug')
    expect(errors).toHaveLength(1)
  })
})

describe('createAssertionRegistry', () => {
  it('includes all built-in assertions', () => {
    const registry = createAssertionRegistry()
    expect(registry).toHaveProperty('is_email')
    expect(registry).toHaveProperty('not_empty')
  })

  it('merges custom assertions', () => {
    const registry = createAssertionRegistry({ is_slug: () => true })
    expect(registry).toHaveProperty('is_slug')
    expect(registry).toHaveProperty('is_email')
  })

  it('custom assertions override built-ins', () => {
    const registry = createAssertionRegistry({ is_email: () => true })
    expect(registry.is_email).not.toBe(createAssertionRegistry().is_email)
  })
})

describe('BUILTIN_ASSERTIONS', () => {
  it('lists all 7 built-in assertion names', () => {
    expect(BUILTIN_ASSERTIONS).toHaveLength(7)
    expect(BUILTIN_ASSERTIONS).toContain('is_email')
    expect(BUILTIN_ASSERTIONS).toContain('is_url')
    expect(BUILTIN_ASSERTIONS).toContain('is_numeric')
    expect(BUILTIN_ASSERTIONS).toContain('is_uuid')
    expect(BUILTIN_ASSERTIONS).toContain('is_boolean')
    expect(BUILTIN_ASSERTIONS).toContain('is_integer')
    expect(BUILTIN_ASSERTIONS).toContain('not_empty')
  })
})
