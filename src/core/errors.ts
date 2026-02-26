/**
 * Storium v1 — Error Types
 *
 * Custom error classes for validation failures and configuration issues.
 * ValidationError accumulates all field errors before throwing, so consumers
 * receive every problem in a single catch rather than fixing one at a time.
 */

import type { FieldError } from './types'

/**
 * Thrown when input validation fails. Contains an array of all field-level
 * errors encountered during the prep pipeline or RuntimeSchema.validate().
 *
 * @example
 * try {
 *   await users.create({ email: '', name: 123 })
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.log(err.errors)
 *     // [
 *     //   { field: 'email', message: 'Email cannot be empty' },
 *     //   { field: 'name', message: 'name must be a String' },
 *     // ]
 *   }
 * }
 */
export class ValidationError extends Error {
  readonly errors: FieldError[]

  constructor(errors: FieldError[]) {
    const count = errors.length
    const summary = count === 1
      ? errors[0]!.message
      : `${count} validation error(s)`

    super(`Validation failed: ${summary}`)
    this.name = 'ValidationError'
    this.errors = errors
  }
}

/**
 * Thrown when Storium configuration is invalid (e.g., missing dialect,
 * bad connection string, unknown column type in DSL).
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

/**
 * Thrown when a defineTable or defineStore call has an invalid schema
 * (e.g., index references a non-existent column, duplicate primary keys).
 */
export class SchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaError'
  }
}

/**
 * Thrown when a store CRUD operation fails at runtime (e.g., create/update
 * returned no rows, find/destroyAll called with empty filters).
 */
export class StoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreError'
  }
}
