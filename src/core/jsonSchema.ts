/**
 * @module jsonSchema
 *
 * Generates JSON Schema objects from Storium column configs. These schemas
 * are used for Fastify/Ajv validation at the HTTP edge, providing fast,
 * compiled validation with zero runtime overhead from Zod or custom logic.
 *
 * JSON Schema generation uses only column metadata (type, maxLength, notNull,
 * required) — it does NOT include column transforms or custom validate logic,
 * as those are runtime-only concerns handled by the prep pipeline and Zod.
 */

import type {
  ColumnsConfig,
  ColumnConfig,
  DslColumnConfig,
  DslType,
  TableAccess,
  JsonSchema,
  JsonSchemaOptions,
} from './types'
import { isRawColumn } from './types'

// --------------------------------------------------------- Type Mapping --

type JsonSchemaType = {
  type: string
  format?: string
  maxLength?: number
  [key: string]: any
}

/**
 * Map a DSL column config to its JSON Schema representation.
 */
const dslTypeToJsonSchema = (config: DslColumnConfig): JsonSchemaType => {
  const base = DSL_TYPE_MAP[config.type]
  if (!base) return { type: 'string' } // fallback

  const result = typeof base === 'function' ? base(config) : { ...base }

  if (config.maxLength && result.type === 'string') {
    result.maxLength = config.maxLength
  }

  return result
}

/**
 * Mapping from DSL type strings to JSON Schema types.
 * Functions receive the column config for parameterized types (e.g., varchar maxLength).
 */
const DSL_TYPE_MAP: Record<DslType, JsonSchemaType | ((c: DslColumnConfig) => JsonSchemaType)> = {
  uuid:      { type: 'string', format: 'uuid' },
  varchar:   (c) => ({ type: 'string', ...(c.maxLength ? { maxLength: c.maxLength } : {}) }),
  text:      { type: 'string' },
  integer:   { type: 'integer' },
  // BigInt values exceed JSON's safe integer range and are typically
  // serialized as strings in JSON APIs. format: 'int64' signals this.
  bigint:    { type: 'string', format: 'int64' },
  serial:    { type: 'integer' },
  real:      { type: 'number' },
  numeric:   { type: 'number' },
  boolean:   { type: 'boolean' },
  timestamp: { type: 'string', format: 'date-time' },
  date:      { type: 'string', format: 'date' },
  // Note: jsonb columns accept any valid JSON value (objects, arrays, scalars),
  // but JSON Schema `{ type: 'object' }` only validates JSON objects. This is
  // the most common real-world use case. If your jsonb column stores arrays or
  // mixed types, use a `raw` column with a custom `validate` callback instead.
  jsonb:     { type: 'object' },
}

/**
 * Get the JSON Schema type for a single column config.
 */
const columnToJsonSchema = (config: ColumnConfig): JsonSchemaType => {
  if (isRawColumn(config)) {
    // Raw columns: can't infer type, default to permissive
    return {} as JsonSchemaType
  }

  return dslTypeToJsonSchema(config as DslColumnConfig)
}

// -------------------------------------------------------- Schema Builders --

/**
 * Build a JSON Schema object from a set of column keys and their configs.
 *
 * @param columns - Full column config record
 * @param keys - Which columns to include
 * @param requiredKeys - Which of those columns are required
 * @param opts - JSON Schema options (e.g., additionalProperties)
 */
const buildJsonSchema = (
  columns: ColumnsConfig,
  keys: string[],
  requiredKeys: string[],
  opts: JsonSchemaOptions = {}
): JsonSchema => {
  const properties: Record<string, any> = {}

  for (const key of keys) {
    const config = columns[key]
    if (!config) continue
    properties[key] = columnToJsonSchema(config)
  }

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: opts.additionalProperties ?? false,
  }

  if (requiredKeys.length > 0) {
    schema.required = requiredKeys
  }

  return schema
}

// ---------------------------------------------------------- Public API --

/**
 * Generate the full set of JSON Schemas for a table definition.
 *
 * Returns factory functions that accept options (e.g., additionalProperties)
 * so each call can customize the output.
 */
export const buildJsonSchemas = (
  columns: ColumnsConfig,
  access: TableAccess
) => {
  // Determine which columns are required for insert.
  // A column is required in the insert schema if it has `required: true`
  // or if it has `notNull: true` and no default value.
  const insertRequired = access.insertable.filter(key => {
    const col = columns[key]
    if (col?.required) return true
    if (!isRawColumn(col) && (col as DslColumnConfig)?.notNull && !(col as DslColumnConfig)?.default) return true
    return false
  })

  // Select: all selectable columns, required = those that are notNull
  const selectRequired = access.selectable.filter(key => {
    const col = columns[key]
    if (isRawColumn(col)) return false
    return (col as DslColumnConfig).notNull === true
  })

  return {
    select: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(columns, access.selectable, selectRequired, opts),

    insert: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(columns, access.insertable, insertRequired, opts),

    update: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(columns, access.mutable, [], opts), // all optional for updates

    full: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(
        columns,
        Object.keys(columns),
        Object.keys(columns).filter(key => {
          const col = columns[key]
          if (isRawColumn(col)) return false
          return (col as DslColumnConfig).notNull === true
        }),
        opts
      ),
  }
}
