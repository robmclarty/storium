import { describe, it, expect, afterEach } from 'vitest'
import { createTestFn, createAssertionRegistry, BUILTIN_ASSERTIONS } from '../../assertions'

describe('built-in assertions', () => {
  const errors: Array<{ field: string; message: string }> = []
  const test = createTestFn('value', errors)

  afterEach(() => { errors.length = 0 })

  /* QA-10166 */ it('[QA-10166] is_email accepts valid emails', () => {
    test('alice@example.com', 'is_email')
    expect(errors).toHaveLength(0)
  })

  /* QA-10167 */ it('[QA-10167] is_email rejects invalid emails', () => {
    test('not-an-email', 'is_email')
    expect(errors).toHaveLength(1)
  })

  /* QA-10168 */ it('[QA-10168] is_url accepts http and https URLs', () => {
    test('https://example.com', 'is_url')
    test('http://example.com/path', 'is_url')
    expect(errors).toHaveLength(0)
  })

  /* QA-10170 */ it('[QA-10170] is_url rejects non-URLs', () => {
    test('example.com', 'is_url')
    expect(errors).toHaveLength(1)
  })

  /* QA-10171 */ it('[QA-10171] is_numeric accepts numbers and numeric strings', () => {
    test(42, 'is_numeric')
    test('3.14', 'is_numeric')
    expect(errors).toHaveLength(0)
  })

  /* QA-10173 */ it('[QA-10173] is_numeric rejects non-numeric values', () => {
    test('abc', 'is_numeric')
    expect(errors).toHaveLength(1)
  })

  /* QA-10174 */ it('[QA-10174] is_uuid accepts valid UUIDs', () => {
    test('550e8400-e29b-41d4-a716-446655440000', 'is_uuid')
    expect(errors).toHaveLength(0)
  })

  /* QA-10175 */ it('[QA-10175] is_uuid rejects invalid UUIDs', () => {
    test('not-a-uuid', 'is_uuid')
    expect(errors).toHaveLength(1)
  })

  /* QA-10176 */ it('[QA-10176] is_boolean accepts true and false', () => {
    test(true, 'is_boolean')
    test(false, 'is_boolean')
    expect(errors).toHaveLength(0)
  })

  /* QA-10177 */ it('[QA-10177] is_boolean rejects non-boolean values', () => {
    test(1, 'is_boolean')
    expect(errors).toHaveLength(1)
  })

  /* QA-10178 */ it('[QA-10178] is_integer accepts whole numbers', () => {
    test(42, 'is_integer')
    expect(errors).toHaveLength(0)
  })

  /* QA-10179 */ it('[QA-10179] is_integer rejects floats', () => {
    test(3.14, 'is_integer')
    expect(errors).toHaveLength(1)
  })

  /* QA-10180 */ it('[QA-10180] not_empty accepts non-empty values', () => {
    test('hello', 'not_empty')
    test(0, 'not_empty')
    expect(errors).toHaveLength(0)
  })

  /* QA-10181 */ it('[QA-10181] not_empty rejects empty strings, null, undefined', () => {
    test('', 'not_empty')
    test(null, 'not_empty')
    test(undefined, 'not_empty')
    test('   ', 'not_empty')
    expect(errors).toHaveLength(4)
  })
})

describe('createTestFn', () => {
  /* QA-10183 */ it('[QA-10183] pushes error for unregistered named assertion', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('value', 'does_not_exist')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('does_not_exist')
    expect(errors[0]!.message).toContain('does_not_exist')
  })

  /* QA-10185 */ it('[QA-10185] supports inline function assertions', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('age', errors)
    test(25, (v: any) => v >= 18)
    expect(errors).toHaveLength(0)
    test(10, (v: any) => v >= 18)
    expect(errors).toHaveLength(1)
  })

  /* QA-10186 */ it('[QA-10186] uses custom error string when provided', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('bad', 'is_email', 'Must be a valid email')
    expect(errors[0]!.message).toBe('Must be a valid email')
  })

  /* QA-10188 */ it('[QA-10188] uses custom error callback when provided', () => {
    const errors: Array<{ field: string; message: string }> = []
    const test = createTestFn('email', errors)
    test('bad', 'is_email', (defaultMsg) => `Custom: ${defaultMsg}`)
    expect(errors[0]!.message).toMatch(/^Custom:/)
  })

  /* QA-10190 */ it('[QA-10190] uses custom assertions from registry', () => {
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
  /* QA-10193 */ it('[QA-10193] includes all built-in assertions', () => {
    const registry = createAssertionRegistry()
    expect(registry).toHaveProperty('is_email')
    expect(registry).toHaveProperty('not_empty')
  })

  /* QA-10194 */ it('[QA-10194] merges custom assertions', () => {
    const registry = createAssertionRegistry({ is_slug: () => true })
    expect(registry).toHaveProperty('is_slug')
    expect(registry).toHaveProperty('is_email')
  })

  /* QA-10195 */ it('[QA-10195] custom assertions override built-ins', () => {
    const registry = createAssertionRegistry({ is_email: () => true })
    expect(registry.is_email).not.toBe(createAssertionRegistry().is_email)
  })
})

describe('BUILTIN_ASSERTIONS', () => {
  /* QA-10196 */ it('[QA-10196] lists all 7 built-in assertion names', () => {
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
