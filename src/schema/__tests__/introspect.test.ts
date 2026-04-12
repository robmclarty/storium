/**
 * Direct tests for column introspection → schema mapping.
 *
 * Tests the drizzleColumnToZod and drizzleColumnToJsonSchema pipelines
 * indirectly via buildZodSchemas/buildJsonSchemas using tables with
 * diverse column types.
 */

import { describe, it, expect } from 'vitest'
import { buildZodSchemas } from '../zod'
import { buildJsonSchemas } from '../json'
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core'
import type { TableAccess } from '../../types'

// -------------------------------------------------------- Helpers --

const access = (keys: string[]): TableAccess => ({
  selectable: keys,
  writable: keys,
  hidden: [],
  readonly: [],
})

// -------------------------------------------------------- String columns --

describe('string column introspection', () => {
  const table = sqliteTable('str_test', {
    plain: text('plain'),
    withLength: text('with_length', { length: 100 }),
    notNullPlain: text('not_null_plain').notNull(),
  })

  const keys = ['plain', 'withLength', 'notNullPlain']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: plain text → z.string()', () => {
    const result = zodSchemas.createSchema.safeParse({ notNullPlain: 'x', plain: 'hello' })
    expect(result.success).toBe(true)
  })

  it('Zod: rejects non-string for text column', () => {
    const result = zodSchemas.createSchema.safeParse({ notNullPlain: 'x', plain: 123 })
    expect(result.success).toBe(false)
  })

  it('Zod: text with length enforces maxLength', () => {
    const result = zodSchemas.createSchema.safeParse({ notNullPlain: 'x', withLength: 'a'.repeat(101) })
    expect(result.success).toBe(false)
  })

  it('JSON Schema: plain text → { type: string }', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.plain).toEqual({ type: 'string' })
  })

  it('JSON Schema: text with length → { type: string, maxLength }', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.withLength).toEqual({ type: 'string', maxLength: 100 })
  })
})

// -------------------------------------------------------- Integer columns --

describe('integer column introspection', () => {
  const table = sqliteTable('int_test', {
    age: integer('age'),
    count: integer('count').notNull(),
  })

  const keys = ['age', 'count']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: integer → z.number().int()', () => {
    const result = zodSchemas.createSchema.safeParse({ count: 42 })
    expect(result.success).toBe(true)
  })

  it('Zod: rejects float for integer column', () => {
    const result = zodSchemas.createSchema.safeParse({ count: 3.14 })
    expect(result.success).toBe(false)
  })

  it('Zod: rejects string for integer column', () => {
    const result = zodSchemas.createSchema.safeParse({ count: 'five' })
    expect(result.success).toBe(false)
  })

  it('JSON Schema: integer → { type: integer }', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.age).toEqual({ type: 'integer' })
  })
})

// -------------------------------------------------------- Real/number columns --

describe('real column introspection', () => {
  const table = sqliteTable('real_test', {
    score: real('score'),
  })

  const keys = ['score']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: real → z.number() (accepts floats)', () => {
    const result = zodSchemas.createSchema.safeParse({ score: 3.14 })
    expect(result.success).toBe(true)
  })

  it('JSON Schema: real → { type: number }', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.score).toEqual({ type: 'number' })
  })
})

// -------------------------------------------------------- Boolean columns --

describe('boolean column introspection', () => {
  const table = sqliteTable('bool_test', {
    active: integer('active', { mode: 'boolean' }),
  })

  const keys = ['active']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))

  it('Zod: boolean mode → z.boolean()', () => {
    const good = zodSchemas.createSchema.safeParse({ active: true })
    expect(good.success).toBe(true)

    const bad = zodSchemas.createSchema.safeParse({ active: 'yes' })
    expect(bad.success).toBe(false)
  })
})

// -------------------------------------------------------- Timestamp columns --

describe('timestamp column introspection', () => {
  const table = sqliteTable('ts_test', {
    createdAt: integer('created_at', { mode: 'timestamp' }),
  })

  const keys = ['createdAt']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: timestamp → z.coerce.date() (accepts Date, string, number)', () => {
    expect(zodSchemas.createSchema.safeParse({ createdAt: new Date() }).success).toBe(true)
    expect(zodSchemas.createSchema.safeParse({ createdAt: '2024-01-01' }).success).toBe(true)
    expect(zodSchemas.createSchema.safeParse({ createdAt: Date.now() }).success).toBe(true)
  })

  it('Zod: rejects non-coercible values for timestamp column', () => {
    expect(zodSchemas.createSchema.safeParse({ createdAt: 'not-a-date' }).success).toBe(false)
  })

  it('JSON Schema: timestamp → { type: string, format: date-time }', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.createdAt).toEqual({ type: 'string', format: 'date-time' })
  })
})

// -------------------------------------------------------- JSON columns --

describe('JSON column introspection (Zod ↔ JSON Schema alignment)', () => {
  const table = sqliteTable('json_test', {
    data: text('data', { mode: 'json' }),
  })

  const keys = ['data']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: json → union of record and array', () => {
    expect(zodSchemas.createSchema.safeParse({ data: { key: 'val' } }).success).toBe(true)
    expect(zodSchemas.createSchema.safeParse({ data: [1, 2, 3] }).success).toBe(true)
  })

  it('Zod: rejects non-object/non-array for json column', () => {
    expect(zodSchemas.createSchema.safeParse({ data: 'plain string' }).success).toBe(false)
    expect(zodSchemas.createSchema.safeParse({ data: 42 }).success).toBe(false)
  })

  it('JSON Schema: json → oneOf: [object, array]', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.data).toEqual({ oneOf: [{ type: 'object' }, { type: 'array' }] })
  })
})

// -------------------------------------------------------- Blob/buffer columns --

describe('blob column introspection', () => {
  const table = sqliteTable('blob_test', {
    data: blob('data'),
  })

  const keys = ['data']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod: blob/buffer → z.any() (accepts anything)', () => {
    expect(zodSchemas.createSchema.safeParse({ data: Buffer.from('hello') }).success).toBe(true)
    expect(zodSchemas.createSchema.safeParse({ data: 'anything' }).success).toBe(true)
  })

  it('JSON Schema: blob/buffer → {} (empty schema, accepts anything)', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.properties.data).toEqual({})
  })
})

// -------------------------------------------------------- Required field alignment --

describe('required field alignment (Zod ↔ JSON Schema)', () => {
  const table = sqliteTable('req_test', {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    requiredCol: text('required_col').notNull(),
    optionalCol: text('optional_col'),
    hasDefaultCol: text('has_default_col').notNull().$defaultFn(() => 'default'),
  })

  const keys = ['requiredCol', 'optionalCol', 'hasDefaultCol']
  const zodSchemas = buildZodSchemas(table, {}, access(keys))
  const jsonSchemas = buildJsonSchemas(table, {}, access(keys))

  it('Zod createSchema: notNull+noDefault is required', () => {
    // Missing requiredCol should fail
    expect(zodSchemas.createSchema.safeParse({ optionalCol: 'ok' }).success).toBe(false)
    // Providing it should pass
    expect(zodSchemas.createSchema.safeParse({ requiredCol: 'val' }).success).toBe(true)
  })

  it('Zod createSchema: notNull+hasDefault is optional', () => {
    // hasDefaultCol should be optional — omitting it should not fail
    expect(zodSchemas.createSchema.safeParse({ requiredCol: 'val' }).success).toBe(true)
  })

  it('JSON Schema createSchema: same required list as Zod', () => {
    const schema = jsonSchemas.createSchema()
    expect(schema.required).toContain('requiredCol')
    expect(schema.required).not.toContain('optionalCol')
    expect(schema.required).not.toContain('hasDefaultCol')
  })
})
