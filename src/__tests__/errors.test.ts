import { describe, it, expect } from 'vitest'
import { ValidationError, ConfigError, SchemaError, StoreError } from '../errors'

describe('ValidationError', () => {
  it('includes the error message when there is a single field error', () => {
    const err = new ValidationError([{ field: 'email', message: 'Email is required' }])
    expect(err.message).toBe('Validation failed: Email is required')
  })

  it('includes the count when there are multiple field errors', () => {
    const err = new ValidationError([
      { field: 'email', message: 'Email is required' },
      { field: 'name', message: 'Name is required' },
    ])
    expect(err.message).toBe('Validation failed: 2 validation error(s)')
  })

  it('exposes the errors array', () => {
    const errors = [{ field: 'email', message: 'bad' }]
    const err = new ValidationError(errors)
    expect(err.errors).toBe(errors)
  })

  it('has the correct name', () => {
    const err = new ValidationError([])
    expect(err.name).toBe('ValidationError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('ConfigError', () => {
  it('has the correct name and message', () => {
    const err = new ConfigError('missing dialect')
    expect(err.name).toBe('ConfigError')
    expect(err.message).toBe('missing dialect')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('SchemaError', () => {
  it('has the correct name and message', () => {
    const err = new SchemaError('no primary key')
    expect(err.name).toBe('SchemaError')
    expect(err.message).toBe('no primary key')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('StoreError', () => {
  it('has the correct name and message', () => {
    const err = new StoreError('row not found')
    expect(err.name).toBe('StoreError')
    expect(err.message).toBe('row not found')
    expect(err).toBeInstanceOf(Error)
  })
})
