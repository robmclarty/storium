import { describe, it, expect } from 'vitest'
import { ValidationError, ConfigError, SchemaError, StoreError } from '../errors'

describe('ValidationError', () => {
  /* QA-10019 */ it('[QA-10019] includes the error message when there is a single field error', () => {
    const err = new ValidationError([{ field: 'email', message: 'Email is required' }])
    expect(err.message).toBe('Validation failed: Email is required')
  })

  /* QA-10020 */ it('[QA-10020] includes the count when there are multiple field errors', () => {
    const err = new ValidationError([
      { field: 'email', message: 'Email is required' },
      { field: 'name', message: 'Name is required' },
    ])
    expect(err.message).toBe('Validation failed: 2 validation error(s)')
  })

  /* QA-10021 */ it('[QA-10021] exposes the errors array', () => {
    const errors = [{ field: 'email', message: 'bad' }]
    const err = new ValidationError(errors)
    expect(err.errors).toBe(errors)
  })

  /* QA-10022 */ it('[QA-10022] has the correct name', () => {
    const err = new ValidationError([])
    expect(err.name).toBe('ValidationError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ConfigError', () => {
  /* QA-10023 */ it('[QA-10023] has the correct name and message', () => {
    const err = new ConfigError('missing dialect')
    expect(err.name).toBe('ConfigError')
    expect(err.message).toBe('missing dialect')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('SchemaError', () => {
  /* QA-10024 */ it('[QA-10024] has the correct name and message', () => {
    const err = new SchemaError('no primary key')
    expect(err.name).toBe('SchemaError')
    expect(err.message).toBe('no primary key')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('StoreError', () => {
  /* QA-10025 */ it('[QA-10025] has the correct name and message', () => {
    const err = new StoreError('row not found')
    expect(err.name).toBe('StoreError')
    expect(err.message).toBe('row not found')
    expect(err).toBeInstanceOf(Error)
  })
})
