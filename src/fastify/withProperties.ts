/**
 * Storium v1 — Fastify JSON Schema Composition
 *
 * Utility for merging Storium-generated JSON Schema objects with additional
 * endpoint-specific properties. Common pattern: a route needs the store's
 * insert schema plus a few extra fields (invite_code, accept_terms, etc.).
 *
 * The primary integration point is `toJsonSchema()` on RuntimeSchema, which
 * returns a plain JSON Schema object. This utility handles the flat-merge
 * case so you don't have to manually spread properties and required arrays.
 *
 * @example
 * import { withProperties } from 'storium/fastify'
 *
 * app.post('/users', {
 *   schema: {
 *     body: withProperties(
 *       users.schemas.insert.toJsonSchema(),
 *       {
 *         invite_code: { type: 'string', minLength: 8, maxLength: 8 },
 *         accept_terms: { type: 'boolean' },
 *       },
 *       ['invite_code', 'accept_terms'],
 *     ),
 *   },
 * })
 */

import type { JsonSchema } from '../core/types'

/**
 * Merge additional properties into an existing JSON Schema object.
 *
 * Performs a flat merge of `properties` and appends to `required`. The
 * original schema is not mutated — a new object is returned.
 *
 * @param schema - A JSON Schema object (typically from `toJsonSchema()`)
 * @param additional - Extra properties to merge in
 * @param additionalRequired - Extra required field names to append
 * @returns A new JSON Schema with merged properties and required
 */
export const withProperties = (
  schema: JsonSchema,
  additional: Record<string, any>,
  additionalRequired: string[] = []
): JsonSchema => {
  const merged: JsonSchema = {
    ...schema,
    properties: {
      ...schema.properties,
      ...additional,
    },
  }

  // Merge required arrays
  const existingRequired = schema.required ?? []
  const allRequired = [...existingRequired, ...additionalRequired]

  if (allRequired.length > 0) {
    merged.required = allRequired
  }

  return merged
}
