/**
 * Storium v1 — RuntimeSchema
 *
 * Wraps a Zod schema and a JSON Schema factory behind a unified interface.
 * Provides Storium-flavored methods (validate, tryValidate, toJsonSchema)
 * so consumers interact with a consistent API regardless of the underlying
 * validation engine.
 *
 * @example
 * // Validate (throws ValidationError on failure)
 * const user = users.schemas.insert.validate(input)
 *
 * // Try validate (never throws)
 * const result = users.schemas.insert.tryValidate(input)
 * if (!result.success) console.log(result.errors)
 *
 * // JSON Schema for Fastify
 * app.post('/users', { schema: { body: users.schemas.insert.toJsonSchema() } })
 *
 * // Zod escape hatch
 * const extended = users.schemas.insert.zod.extend({ extra: z.string() })
 */

import type { ZodType, ZodError } from 'zod'
import type {
  RuntimeSchema,
  SchemaSet,
  JsonSchema,
  JsonSchemaOptions,
  ValidationResult,
  FieldError,
  ColumnsConfig,
  TableAccess,
  AssertionRegistry,
} from './types'
import { ValidationError } from './errors'
import { buildZodSchemas } from './zodSchema'
import { buildJsonSchemas } from './jsonSchema'

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
 * Build the full SchemaSet for a table definition.
 *
 * @param columns - Column config record
 * @param access - Derived access sets
 * @param assertions - Combined assertion registry (built-ins + user-defined)
 * @returns SchemaSet with select, insert, update, and full RuntimeSchemas
 */
export const buildSchemaSet = (
  columns: ColumnsConfig,
  access: TableAccess,
  assertions: AssertionRegistry = {}
): SchemaSet<any> => {
  const zodSchemas = buildZodSchemas(columns, access, assertions)
  const jsonSchemas = buildJsonSchemas(columns, access)

  return {
    select: createRuntimeSchema(zodSchemas.select, jsonSchemas.select) as RuntimeSchema<any>,
    insert: createRuntimeSchema(zodSchemas.insert, jsonSchemas.insert) as RuntimeSchema<any>,
    update: createRuntimeSchema(zodSchemas.update, jsonSchemas.update) as RuntimeSchema<any>,
    full:   createRuntimeSchema(zodSchemas.full, jsonSchemas.full) as RuntimeSchema<any>,
  }
}
