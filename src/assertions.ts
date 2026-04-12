/**
 * @module test
 *
 * The `test()` function is passed into column `validate` callbacks. It provides
 * a simple way to assert that a value meets a condition, using either built-in
 * named assertions, user-registered named assertions, or inline functions.
 *
 * Built-in assertions use lightweight checks with no external dependencies.
 *
 * @example
 * validate: (value, test) => {
 *   test(value, 'not_empty', 'Email cannot be empty')
 *   test(value, 'is_email')
 *   test(value, v => String(v).length <= 255, 'Too long')
 * }
 */

import type { AssertionRegistry, TestFn } from './types'

// -------------------------------------------------- Built-in Assertions --

/** Basic email format check. Not RFC-exhaustive — catches obvious errors. */
const isEmail = (v: unknown): boolean =>
  typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

/** Basic URL format check. Accepts http(s) and protocol-relative URLs. */
const isUrl = (v: unknown): boolean =>
  typeof v === 'string' && /^(https?:\/\/|\/\/)[^\s]+$/.test(v)

/** Value is a number or a string that represents a number. */
const isNumeric = (v: unknown): boolean => {
  if (typeof v === 'number') return !Number.isNaN(v)
  if (typeof v === 'string') return v.trim() !== '' && !Number.isNaN(Number(v))
  return false
}

/** UUID v4 or v7 format check. */
const isUuid = (v: unknown): boolean =>
  typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/** Value is a boolean. */
const isBoolean = (v: unknown): boolean =>
  typeof v === 'boolean'

/** Value is an integer (whole number). */
const isInteger = (v: unknown): boolean =>
  typeof v === 'number' && Number.isInteger(v)

/** Value is not empty: rejects '', null, undefined. */
const notEmpty = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  return true
}

/** The built-in assertion registry. */
const BUILTINS: AssertionRegistry = {
  is_email: isEmail,
  is_url: isUrl,
  is_numeric: isNumeric,
  is_uuid: isUuid,
  is_boolean: isBoolean,
  is_integer: isInteger,
  not_empty: notEmpty,
}

// -------------------------------------------------------- Test Factory --

/**
 * Create a `test()` function bound to a specific field name, error collector,
 * and assertion registry (built-ins + user-registered).
 *
 * This is used internally by the prep pipeline to create the `test` function
 * passed into each column's `validate` callback.
 *
 * @param fieldName - The name of the field being validated (for error messages)
 * @param errors - Array to push FieldErrors into (accumulation, not throwing)
 * @param customAssertions - User-defined named assertions from connect() config
 */
export const createTestFn = (
  fieldName: string,
  errors: Array<{ field: string; message: string }>,
  customAssertions: AssertionRegistry = {}
): TestFn => {
  const registry: AssertionRegistry = { ...BUILTINS, ...customAssertions }

  return (value, assertion, customError) => {
    let isValid = false
    let defaultMessage = `\`${fieldName}\` is not valid`

    if (typeof assertion === 'function') {
      // Inline function assertion
      isValid = assertion(value)
      defaultMessage = `\`${fieldName}\` is not valid`
    } else if (typeof assertion === 'string') {
      // Named assertion (built-in or user-registered)
      const assertFn = registry[assertion]

      if (!assertFn) {
        errors.push({
          field: fieldName,
          message: `No assertion named '${assertion}' is registered`,
        })
        return
      }

      isValid = assertFn(value)
      defaultMessage = `\`${fieldName}\` failed '${assertion}' check`
    }

    if (isValid) return

    // Determine the error message
    errors.push({
      field: fieldName,
      message: typeof customError === 'function'
        ? customError(defaultMessage)
        : typeof customError === 'string'
          ? customError
          : defaultMessage,
    })
  }
}

/**
 * Merge user-defined assertions with built-ins and return the combined registry.
 * User assertions override built-ins if names collide.
 */
export const createAssertionRegistry = (
  custom: AssertionRegistry = {}
): AssertionRegistry => ({
  ...BUILTINS,
  ...custom,
})

/** Expose built-in assertion names for documentation/introspection. */
export const BUILTIN_ASSERTIONS = Object.keys(BUILTINS)
