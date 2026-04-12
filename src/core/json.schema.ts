/**
 * @module jsonSchema
 *
 * Generates JSON Schema objects by introspecting Drizzle column metadata.
 * These schemas are used for Fastify/Ajv validation at the HTTP edge,
 * providing fast, compiled validation with zero runtime overhead from Zod.
 *
 * JSON Schema generation uses only column metadata (type, maxLength, notNull)
 * plus storium annotations (required) — it does NOT include transforms or
 * custom validate logic, as those are runtime-only concerns.
 */

import type {
  ColumnAnnotations,
  TableAccess,
  JsonSchema,
  JsonSchemaOptions,
} from './types'
import { drizzleColumnToJsonSchema, type DrizzleColumn } from './introspect'
import { getTableColumns } from 'drizzle-orm/utils'

// -------------------------------------------------------- Schema Builders --

/**
 * Build a JSON Schema object from a set of column keys.
 */
const buildJsonSchema = (
  drizzleTable: any,
  keys: string[],
  requiredKeys: string[],
  opts: JsonSchemaOptions = {}
): JsonSchema => {
  const properties: Record<string, any> = {}
  const drizzleCols = getTableColumns(drizzleTable)

  for (const key of keys) {
    const col = drizzleCols[key] as DrizzleColumn | undefined
    if (!col) continue
    properties[key] = drizzleColumnToJsonSchema(col)
  }

  // Merge extra properties from options
  if (opts.properties) {
    Object.assign(properties, opts.properties)
  }

  // Merge required: base + extras
  const allRequired = [
    ...requiredKeys,
    ...(opts.required ?? []),
  ]

  const schema: JsonSchema = {
    type: 'object',
    properties,
    additionalProperties: opts.additionalProperties ?? false,
  }

  if (allRequired.length > 0) {
    schema.required = allRequired
  }

  if (opts.title) schema.title = opts.title
  if (opts.description) schema.description = opts.description
  if (opts.$id) schema.$id = opts.$id

  return schema
}

// ---------------------------------------------------------- Public API --

/**
 * Generate the full set of JSON Schemas for a table.
 *
 * @param drizzleTable - The raw Drizzle table
 * @param annotations - Per-column storium annotations
 * @param access - Derived access sets
 */
export const buildJsonSchemas = (
  drizzleTable: any,
  annotations: ColumnAnnotations,
  access: TableAccess
) => {
  const drizzleCols = getTableColumns(drizzleTable)

  // Determine which columns are required for insert.
  // A column is required if it has `required: true` in annotations,
  // or if it is notNull without a default.
  const insertRequired = access.writable.filter(key => {
    const ann = annotations[key]
    if (ann?.required) return true
    const col = drizzleCols[key] as DrizzleColumn | undefined
    if (col?.notNull && !col.hasDefault) return true
    return false
  })

  // Select: required = those that are notNull
  const selectRequired = access.selectable.filter(key => {
    const col = drizzleCols[key] as DrizzleColumn | undefined
    return col?.notNull === true
  })

  return {
    selectSchema: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(drizzleTable, access.selectable, selectRequired, opts),

    createSchema: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(drizzleTable, access.writable, insertRequired, opts),

    updateSchema: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(drizzleTable, access.writable, [], opts), // all optional for updates

    fullSchema: (opts?: JsonSchemaOptions) =>
      buildJsonSchema(
        drizzleTable,
        Object.keys(drizzleCols),
        Object.keys(drizzleCols).filter(key => {
          const col = drizzleCols[key] as DrizzleColumn | undefined
          return col?.notNull === true
        }),
        opts
      ),
  }
}
