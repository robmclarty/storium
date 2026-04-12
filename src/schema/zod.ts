/**
 * @module schema
 *
 * Generates Zod schemas by introspecting Drizzle column metadata and
 * layering on storium-specific annotations (transforms, validate callbacks).
 * Wraps each schema behind a unified RuntimeSchema interface that provides
 * validate, tryValidate, and toJsonSchema methods.
 *
 * Drizzle columns provide base type info (.dataType, .columnType, .length).
 * Annotations provide storium extras (transform, validate, required, hidden, readonly).
 */

import { z, type ZodType, type ZodError } from 'zod'
import type {
  ColumnAnnotations,
  TableAccess,
  AssertionRegistry,
  RuntimeSchema,
  SchemaSet,
  JsonSchema,
  JsonSchemaOptions,
  ValidationResult,
  FieldError,
  DrizzleColumn,
} from '../types'
import { createTestFn } from '../store/assertions'
import { ValidationError } from '../errors'
import { buildJsonSchemas } from './json'
import { getTableColumns } from 'drizzle-orm/utils'

// -------------------------------------------------- Column Type Constants --

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

// --------------------------------------------------- Drizzle → Zod Mapping --

/**
 * Map a Drizzle column to a base Zod schema.
 * Uses columnType for precision, falls back to dataType for broad category.
 */
const drizzleColumnToZod = (col: DrizzleColumn): ZodType => {
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

// -------------------------------------------------------- Field Builder --

/**
 * Build a single Zod field from a Drizzle column + optional annotation.
 * Layers on column transforms and validate refinements when present.
 */
const buildZodField = (
  key: string,
  drizzleCol: DrizzleColumn,
  annotation: { transform?: (value: any) => unknown | Promise<unknown>; validate?: (value: any, test: any) => void } | undefined,
  assertions: AssertionRegistry
): ZodType => {
  // Base type from Drizzle column introspection
  let field: ZodType = drizzleColumnToZod(drizzleCol)

  // Layer on column transform as a Zod transform
  if (annotation?.transform) {
    const transformFn = annotation.transform
    field = field.transform((val) => transformFn(val))
  }

  // Layer on validate as a Zod superRefine
  if (annotation?.validate) {
    const validateFn = annotation.validate
    field = (field as any).superRefine((val: any, ctx: any) => {
      const errors: Array<{ field: string; message: string }> = []
      const testFn = createTestFn(key, errors, assertions)

      validateFn(val, testFn)

      for (const err of errors) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err.message,
        })
      }
    })
  }

  return field
}

// ------------------------------------------------------- Schema Builder --

/**
 * Build a Zod object schema from a set of column keys and their configs.
 */
const buildZodSchema = (
  drizzleTable: any,
  annotations: ColumnAnnotations,
  keys: string[],
  mode: 'strict' | 'insert' | 'update',
  assertions: AssertionRegistry
): ZodType => {
  const shape: Record<string, ZodType> = {}
  const drizzleCols = getTableColumns(drizzleTable)

  for (const key of keys) {
    const drizzleCol = drizzleCols[key] as DrizzleColumn | undefined
    if (!drizzleCol) continue

    const annotation = annotations[key]
    let field = buildZodField(key, drizzleCol, annotation, assertions)

    // Handle optional/required based on mode
    switch (mode) {
      case 'strict':
        // All fields as-is (required if notNull, optional otherwise)
        if (!drizzleCol.notNull) field = field.optional()
        break

      case 'insert':
        // Required fields stay required; everything else is optional
        if (!annotation?.required) field = field.optional()
        break

      case 'update':
        // Everything is optional for updates
        field = field.optional()
        break
    }

    shape[key] = field
  }

  return z.object(shape)
}

/**
 * Generate the full set of Zod schemas for a table.
 */
export const buildZodSchemas = (
  drizzleTable: any,
  annotations: ColumnAnnotations,
  access: TableAccess,
  assertions: AssertionRegistry = {}
) => ({
  selectSchema: buildZodSchema(drizzleTable, annotations, access.selectable, 'strict', assertions),
  createSchema: buildZodSchema(drizzleTable, annotations, access.writable, 'insert', assertions),
  updateSchema: buildZodSchema(drizzleTable, annotations, access.writable, 'update', assertions),
  fullSchema:   buildZodSchema(drizzleTable, annotations, Object.keys(getTableColumns(drizzleTable)), 'strict', assertions),
})

// --------------------------------------------------- Runtime Wrapper --

/**
 * Convert a ZodError into Storium's FieldError array.
 */
const zodErrorToFieldErrors = (zodError: ZodError): FieldError[] =>
  zodError.issues.map(issue => ({
    field: issue.path.join('.') || 'unknown',
    message: issue.message,
  }))

/**
 * Create a RuntimeSchema wrapping a Zod schema and a JSON Schema factory.
 */
const createRuntimeSchema = <T>(
  zodSchema: ZodType<T>,
  jsonSchemaFactory: (opts?: JsonSchemaOptions) => JsonSchema
): RuntimeSchema<T> => ({

  validate(input: unknown): T {
    const result = zodSchema.safeParse(input)

    if (result.success) return result.data

    throw new ValidationError(zodErrorToFieldErrors(result.error))
  },

  tryValidate(input: unknown): ValidationResult<T> {
    const result = zodSchema.safeParse(input)

    if (result.success) {
      return { success: true, data: result.data }
    }

    return {
      success: false,
      errors: zodErrorToFieldErrors(result.error),
    }
  },

  toJsonSchema(opts?: JsonSchemaOptions): JsonSchema {
    return jsonSchemaFactory(opts)
  },

  zod: zodSchema,
})

// -------------------------------------------------------- Public API --

/**
 * Build the full SchemaSet for a table.
 *
 * @param drizzleTable - The raw Drizzle table
 * @param annotations - Per-column storium annotations
 * @param access - Derived access sets
 * @param assertions - Combined assertion registry (built-ins + user-defined)
 */
export const buildSchemaSet = (
  drizzleTable: any,
  annotations: ColumnAnnotations,
  access: TableAccess,
  assertions: AssertionRegistry = {}
): SchemaSet => {
  const zodSchemas = buildZodSchemas(drizzleTable, annotations, access, assertions)
  const jsonSchemas = buildJsonSchemas(drizzleTable, annotations, access)

  return {
    selectSchema: createRuntimeSchema(zodSchemas.selectSchema, jsonSchemas.selectSchema),
    createSchema: createRuntimeSchema(zodSchemas.createSchema, jsonSchemas.createSchema),
    updateSchema: createRuntimeSchema(zodSchemas.updateSchema, jsonSchemas.updateSchema),
    fullSchema:   createRuntimeSchema(zodSchemas.fullSchema, jsonSchemas.fullSchema),
  }
}
