/**
 * @module zodSchema
 *
 * Generates Zod schemas by introspecting Drizzle column metadata and
 * layering on storium-specific annotations (transforms, validate callbacks).
 *
 * Drizzle columns provide base type info (.dataType, .columnType, .length).
 * Annotations provide storium extras (transform, validate, required, hidden, readonly).
 */

import { z, type ZodType } from 'zod'
import type { ColumnAnnotations, TableAccess, AssertionRegistry } from './types'
import { drizzleColumnToZod, type DrizzleColumn } from './introspect'
import { createTestFn } from './test'
import { getTableColumns } from 'drizzle-orm/utils'

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

// ---------------------------------------------------------- Public API --

/**
 * Generate the full set of Zod schemas for a table.
 *
 * @param drizzleTable - The raw Drizzle table
 * @param annotations - Per-column storium annotations
 * @param access - Derived access sets
 * @param assertions - Combined assertion registry
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
