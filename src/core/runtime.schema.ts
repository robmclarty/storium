/**
 * @module runtimeSchema
 *
 * Wraps a Zod schema and a JSON Schema factory behind a unified interface.
 * Provides Storium-flavored methods (validate, tryValidate, toJsonSchema)
 * so consumers interact with a consistent API regardless of the underlying
 * validation engine.
 */

import type { ZodType, ZodError } from 'zod'
import type {
  RuntimeSchema,
  SchemaSet,
  JsonSchema,
  JsonSchemaOptions,
  ValidationResult,
  FieldError,
  ColumnAnnotations,
  TableAccess,
  AssertionRegistry,
} from './types'
import { ValidationError } from './errors'
import { buildZodSchemas } from './zod.schema'
import { buildJsonSchemas } from './json.schema'

// ------------------------------------------------------------ Helpers --

/**
 * Convert a ZodError into Storium's FieldError array.
 */
const zodErrorToFieldErrors = (zodError: ZodError): FieldError[] =>
  zodError.issues.map(issue => ({
    field: issue.path.join('.') || 'unknown',
    message: issue.message,
  }))

// --------------------------------------------------------- Factory --

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
