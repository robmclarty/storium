/**
 * @module introspect
 *
 * Introspects Drizzle column metadata at runtime and maps it to Zod and
 * JSON Schema types. This replaces the old DSL type mapping — storium no
 * longer needs its own column type system because Drizzle columns already
 * carry all the necessary metadata (.dataType, .columnType, .notNull, etc.).
 */

import { z, type ZodType } from 'zod'

// --------------------------------------------------------- Drizzle Column --

/**
 * Minimal shape of a Drizzle column object at runtime.
 * We only declare what we actually read — no coupling to Drizzle internals.
 */
export type DrizzleColumn = {
  name: string
  dataType: string
  columnType: string
  notNull: boolean
  hasDefault: boolean
  primary: boolean
  isUnique: boolean
  enumValues?: string[]
  length?: number
  /** Array columns expose their base column type. */
  baseColumn?: DrizzleColumn
  [key: string]: any
}

// ----------------------------------------------------------- Zod Mapping --

/** Set of columnType strings that represent UUID columns. */
const UUID_COLUMN_TYPES = new Set([
  'PgUUID', 'PgUuid',
])

/** Set of columnType strings that represent serial/auto-increment columns. */
const SERIAL_COLUMN_TYPES = new Set([
  'PgSerial', 'PgSmallSerial', 'PgBigSerial53', 'PgBigSerial64',
  'MySqlSerial',
])

/** Set of columnType strings that represent integer columns (need .int() refinement). */
const INTEGER_COLUMN_TYPES = new Set([
  'PgInteger', 'PgSmallInt',
  'MySqlInt', 'MySqlSmallInt', 'MySqlMediumInt', 'MySqlTinyInt',
  'SQLiteInteger',
])

/**
 * Map a Drizzle column to a base Zod schema.
 * Uses columnType for precision, falls back to dataType for broad category.
 */
export const drizzleColumnToZod = (col: DrizzleColumn): ZodType => {
  // Precision: check columnType first for specific types
  if (UUID_COLUMN_TYPES.has(col.columnType)) return z.string().uuid()
  if (SERIAL_COLUMN_TYPES.has(col.columnType)) return z.number().int()
  if (INTEGER_COLUMN_TYPES.has(col.columnType)) return z.number().int()

  // Enum columns
  if (col.enumValues && col.enumValues.length > 0) {
    return z.enum(col.enumValues as [string, ...string[]])
  }

  // Broad category: use dataType
  switch (col.dataType) {
    case 'string': {
      const base = z.string()
      if (typeof col.length === 'number') return base.max(col.length)
      return base
    }
    case 'number':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'date':
      return z.coerce.date()
    case 'json':
      return z.record(z.string(), z.unknown())
    case 'array': {
      if (col.baseColumn) {
        const itemSchema = drizzleColumnToZod(col.baseColumn)
        return z.array(itemSchema)
      }
      return z.array(z.unknown())
    }
    case 'bigint':
      return z.bigint()
    case 'buffer':
      return z.any()
    default:
      return z.any()
  }
}

// ------------------------------------------------------ JSON Schema Mapping --

type JsonSchemaType = {
  type: string
  format?: string
  maxLength?: number
  items?: JsonSchemaType | Record<string, never>
  enum?: string[]
  [key: string]: any
}

/**
 * Map a Drizzle column to a JSON Schema type definition.
 */
export const drizzleColumnToJsonSchema = (col: DrizzleColumn): JsonSchemaType => {
  // Precision: UUID columns
  if (UUID_COLUMN_TYPES.has(col.columnType)) {
    return { type: 'string', format: 'uuid' }
  }

  // Serial / auto-increment
  if (SERIAL_COLUMN_TYPES.has(col.columnType)) {
    return { type: 'integer' }
  }

  // Integer columns
  if (INTEGER_COLUMN_TYPES.has(col.columnType)) {
    return { type: 'integer' }
  }

  // Enum columns
  if (col.enumValues && col.enumValues.length > 0) {
    return { type: 'string', enum: col.enumValues }
  }

  // Broad category
  switch (col.dataType) {
    case 'string': {
      const result: JsonSchemaType = { type: 'string' }
      if (typeof col.length === 'number') result.maxLength = col.length
      return result
    }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'date':
      // Distinguish timestamp vs date by columnType
      if (col.columnType.includes('Date') && !col.columnType.includes('Time')) {
        return { type: 'string', format: 'date' }
      }
      return { type: 'string', format: 'date-time' }
    case 'json':
      return { type: 'object' }
    case 'array': {
      const items = col.baseColumn
        ? drizzleColumnToJsonSchema(col.baseColumn)
        : {}
      return { type: 'array', items }
    }
    case 'bigint':
      // BigInt exceeds JSON's safe integer range — serialized as string
      return { type: 'string', format: 'int64' }
    default:
      return {} as JsonSchemaType
  }
}

// -------------------------------------------------------- Data Type Checks --

/**
 * Runtime type checks keyed by Drizzle dataType.
 * Used by the prep pipeline to validate input values before DB operations.
 */
export const DATA_TYPE_CHECKS: Record<string, (value: unknown) => boolean> = {
  string:  (v) => typeof v === 'string',
  number:  (v) => typeof v === 'number',
  boolean: (v) => typeof v === 'boolean',
  date:    (v) => v instanceof Date || typeof v === 'string' || typeof v === 'number',
  json:    (v) => typeof v === 'object' && v !== null,
  array:   (v) => Array.isArray(v),
  bigint:  (v) => typeof v === 'bigint',
}

/** Human-readable type names for error messages, keyed by Drizzle dataType. */
export const DATA_TYPE_NAMES: Record<string, string> = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  date: 'Date or date string',
  json: 'object',
  array: 'array',
  bigint: 'bigint',
}
