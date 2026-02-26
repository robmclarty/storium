/**
 * @module zodSchema
 *
 * Generates Zod schemas from Storium column configs. Unlike JSON Schema
 * generation (which only captures structure), Zod schemas include:
 * - column transforms (via .transform())
 * - validate callbacks (via .superRefine() bridging test() into Zod)
 * - maxLength constraints
 * - proper optional/required handling per schema variant
 *
 * These schemas serve as exportable runtime contracts for API boundaries,
 * frontend validation, and cross-service type sharing.
 */

import { z, type ZodType } from 'zod'
import type {
  ColumnsConfig,
  ColumnConfig,
  DslColumnConfig,
  DslType,
  TableAccess,
  AssertionRegistry,
} from './types'
import { isRawColumn } from './types'
import { createTestFn } from './test'

// --------------------------------------------------------- Type Mapping --

/**
 * Map DSL type strings to base Zod types.
 */
const dslTypeToZod = (config: DslColumnConfig): ZodType => {
  const base = ZOD_TYPE_MAP[config.type]
  if (!base) return z.any()

  const field = typeof base === 'function' ? base(config) : base

  return field
}

const ZOD_TYPE_MAP: Record<DslType, ZodType | ((c: DslColumnConfig) => ZodType)> = {
  uuid:      z.string().uuid(),
  varchar:   (c) => c.maxLength ? z.string().max(c.maxLength) : z.string(),
  text:      z.string(),
  integer:   z.number().int(),
  bigint:    z.bigint(),
  serial:    z.number().int(),
  real:      z.number(),
  numeric:   z.number(),
  boolean:   z.boolean(),
  timestamp: z.coerce.date(),
  date:      z.coerce.date(),
  jsonb:     z.record(z.string(), z.unknown()),
}

// -------------------------------------------------------- Field Builder --

/**
 * Build a single Zod field from a column config. Layers on column transforms
 * and validate refinements when present.
 *
 * @param key - Column name (for error messages in test())
 * @param config - The column config
 * @param assertions - Combined assertion registry (built-ins + user-defined)
 */
const buildZodField = (
  key: string,
  config: ColumnConfig,
  assertions: AssertionRegistry
): ZodType => {
  // Base type
  let field: ZodType = isRawColumn(config)
    ? z.any()
    : dslTypeToZod(config as DslColumnConfig)

  // Layer on column transform as a Zod transform
  if (config.transform) {
    const transformFn = config.transform
    field = field.transform((val) => transformFn(val))
  }

  // Layer on validate as a Zod superRefine
  // This bridges the test() callback pattern into Zod's refinement system
  if (config.validate) {
    const validateFn = config.validate
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
 *
 * @param columns - Full column config record
 * @param keys - Which columns to include
 * @param mode - 'insert' makes required fields mandatory; 'update' makes everything optional
 * @param assertions - Assertion registry for test() in validate callbacks
 */
const buildZodSchema = (
  columns: ColumnsConfig,
  keys: string[],
  mode: 'strict' | 'insert' | 'update',
  assertions: AssertionRegistry
): ZodType => {
  const shape: Record<string, ZodType> = {}

  for (const key of keys) {
    const config = columns[key]
    if (!config) continue

    let field = buildZodField(key, config, assertions)

    // Handle optional/required based on mode
    switch (mode) {
      case 'strict':
        // All fields as-is (required if notNull, optional otherwise)
        if (!isRawColumn(config)) {
          const dsl = config as DslColumnConfig
          if (!dsl.notNull) field = field.optional()
        }
        break

      case 'insert':
        // Required fields stay required; everything else is optional
        if (!config.required) field = field.optional()
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

// ---------------------------------------------------------- Public API --

/**
 * Generate the full set of Zod schemas for a table definition.
 *
 * @param columns - The column config record
 * @param access - Derived access sets
 * @param assertions - Combined assertion registry
 */
export const buildZodSchemas = (
  columns: ColumnsConfig,
  access: TableAccess,
  assertions: AssertionRegistry = {}
) => ({
  select: buildZodSchema(columns, access.selectable, 'strict', assertions),
  insert: buildZodSchema(columns, access.insertable, 'insert', assertions),
  update: buildZodSchema(columns, access.mutable, 'update', assertions),
  full:   buildZodSchema(columns, Object.keys(columns), 'strict', assertions),
})
