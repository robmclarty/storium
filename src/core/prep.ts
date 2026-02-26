/**
 * @module prep
 *
 * The `prep` pipeline processes input data before database operations.
 * It runs four stages in order:
 *
 * 1. Filter — remove unknown keys; optionally restrict to mutable keys
 * 2. Transform — run column transform fns (sanitization, enrichment, or any pre-save logic)
 * 3. Validate — run type checks + custom validate callbacks; collect ALL errors
 * 4. Required — ensure all required columns have defined values
 *
 * The pipeline accumulates all errors before throwing a single ValidationError,
 * so consumers get every problem in one round trip.
 *
 * `force: true` skips the entire pipeline and passes input through raw.
 */

import type {
  ColumnsConfig,
  DslColumnConfig,
  DslType,
  TableAccess,
  PrepOptions,
  AssertionRegistry,
  FieldError,
} from './types'
import { isRawColumn } from './types'
import { ValidationError } from './errors'
import { createTestFn } from './test'

// --------------------------------------------------- Type Checking --

/**
 * Basic runtime type checks based on DSL column type.
 * These run before custom validate callbacks.
 */
const TYPE_CHECKS: Partial<Record<DslType, (value: unknown) => boolean>> = {
  varchar:   (v) => typeof v === 'string',
  text:      (v) => typeof v === 'string',
  uuid:      (v) => typeof v === 'string',
  integer:   (v) => typeof v === 'number' && Number.isInteger(v),
  bigint:    (v) => typeof v === 'bigint',
  serial:    (v) => typeof v === 'number' && Number.isInteger(v),
  real:      (v) => typeof v === 'number',
  numeric:   (v) => typeof v === 'number',
  boolean:   (v) => typeof v === 'boolean',
  timestamp: (v) => v instanceof Date || typeof v === 'string' || typeof v === 'number',
  date:      (v) => v instanceof Date || typeof v === 'string',
  jsonb:     (v) => typeof v === 'object' && v !== null,
}

const TYPE_NAMES: Partial<Record<DslType, string>> = {
  varchar: 'string', text: 'string', uuid: 'string',
  integer: 'integer', bigint: 'bigint', serial: 'integer',
  real: 'number', numeric: 'number', boolean: 'boolean',
  timestamp: 'Date or date string', date: 'Date or date string',
  jsonb: 'object',
}

// ---------------------------------------------------- Pipeline Stages --

/**
 * Stage 1: Filter
 * Remove keys not defined in the column config. If `onlyMutables` is true,
 * further restrict to mutable columns only.
 */
const filterInput = (
  input: Record<string, any>,
  columns: ColumnsConfig,
  access: TableAccess,
  onlyMutables: boolean
): Record<string, any> => {
  const allowedKeys = new Set(
    onlyMutables ? access.mutable : Object.keys(columns)
  )

  const result: Record<string, any> = {}

  for (const key of Object.keys(input)) {
    // Drop undefined values here so transforms are never called on absent keys.
    if (allowedKeys.has(key) && input[key] !== undefined) {
      result[key] = input[key]
    }
  }

  return result
}

/**
 * Stage 2: Transform
 * For each key with a transform function, run it on the value. Transforms can
 * perform sanitization (trim, lowercase), enrichment, or any other pre-save logic.
 * Supports async transforms via Promise.all.
 */
const transformInput = async (
  input: Record<string, any>,
  columns: ColumnsConfig
): Promise<Record<string, any>> => {
  const keys = Object.keys(input)
  const transformPromises: Array<{ key: string; promise: any }> = []

  for (const key of keys) {
    const config = columns[key]
    if (config?.transform) {
      transformPromises.push({
        key,
        promise: Promise.resolve(config.transform(input[key])),
      })
    }
  }

  if (transformPromises.length === 0) return input

  const results = await Promise.all(transformPromises.map(s => s.promise))
  const transformed = { ...input }

  transformPromises.forEach((s, i) => {
    transformed[s.key] = results[i]
  })

  return transformed
}

/**
 * Stage 3: Validate
 * Run basic type checks (from DSL type) and custom validate callbacks.
 * Collects all errors rather than throwing on the first failure.
 */
const validateInput = (
  input: Record<string, any>,
  columns: ColumnsConfig,
  assertions: AssertionRegistry
): FieldError[] => {
  const errors: FieldError[] = []

  for (const [key, value] of Object.entries(input)) {
    const config = columns[key]
    if (!config) continue

    // Basic type check (DSL columns only)
    if (!isRawColumn(config)) {
      const dsl = config as DslColumnConfig
      const typeCheck = TYPE_CHECKS[dsl.type]

      if (typeCheck && !typeCheck(value)) {
        const typeName = TYPE_NAMES[dsl.type] ?? dsl.type
        errors.push({
          field: key,
          message: `\`${key}\` must be a ${typeName}`,
        })
        // Skip custom validation if basic type check fails
        continue
      }

      // maxLength check for varchar columns
      if (dsl.type === 'varchar' && dsl.maxLength !== undefined && typeof value === 'string') {
        if (value.length > dsl.maxLength) {
          errors.push({
            field: key,
            message: `\`${key}\` must be at most ${dsl.maxLength} characters`,
          })
          continue
        }
      }
    }

    // Custom validate callback
    if (config.validate) {
      const testFn = createTestFn(key, errors, assertions)
      config.validate(value, testFn)
    }
  }

  return errors
}

/**
 * Stage 4: Required check
 * Verify all required columns have defined values in the input.
 */
const checkRequired = (
  input: Record<string, any>,
  columns: ColumnsConfig,
  _access: TableAccess
): FieldError[] => {
  const errors: FieldError[] = []

  for (const key of Object.keys(columns)) {
    const config = columns[key]
    if (!config?.required) continue

    const value = input[key]
    if (value === undefined || value === null) {
      errors.push({
        field: key,
        message: `\`${key}\` is required`,
      })
    }
  }

  return errors
}

// -------------------------------------------------------- Public API --

/**
 * Create a `prep` function bound to a specific table's columns, access rules,
 * and assertion registry.
 *
 * The returned function processes raw input through the full pipeline
 * (filter → transform → validate → required) unless `force: true` is set.
 */
export const createPrepFn = (
  columns: ColumnsConfig,
  access: TableAccess,
  assertions: AssertionRegistry = {}
) => {
  /**
   * Process raw input through the prep pipeline.
   *
   * @param input - Raw input object
   * @param options - Pipeline options
   * @returns Processed input (filtered, transformed, validated)
   * @throws ValidationError if any validation fails
   */
  return async (
    input: Record<string, any>,
    options: PrepOptions = {}
  ): Promise<Record<string, any>> => {
    const {
      force = false,
      validateRequired = true,
      onlyMutables = false,
    } = options

    // Skip everything if forced
    if (force) return input

    // Stage 1: Filter
    const filtered = filterInput(input, columns, access, onlyMutables)

    // Stage 2: Transform
    const transformed = await transformInput(filtered, columns)

    // Stage 3: Validate (accumulates errors)
    const validationErrors = validateInput(transformed, columns, assertions)

    // Stage 4: Required check (accumulates errors)
    const requiredErrors = validateRequired
      ? checkRequired(transformed, columns, access)
      : []

    // Combine and throw if any errors
    const allErrors = [...validationErrors, ...requiredErrors]

    if (allErrors.length > 0) {
      throw new ValidationError(allErrors)
    }

    return transformed
  }
}
