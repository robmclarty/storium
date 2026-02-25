/**
 * Storium v1 — Schema Collector
 *
 * Collects Drizzle table objects from Storium schema files. Used by the CLI
 * and programmatic migration API to build the schema map that drizzle-kit
 * diffs against the database.
 *
 * Scans files matching glob patterns from the config, imports them, and
 * extracts `.table` properties from any TableDef or Store exports.
 *
 * @example
 * const tables = await collectSchemas([
 *   './src/entities/**\/*.schema.ts',
 *   './src/collections/**\/*.schema.ts',
 * ])
 * // { users: <DrizzleTable>, teams: <DrizzleTable>, ... }
 */

import { glob } from 'glob'
import path from 'path'

// --------------------------------------------------------------- Types --

/** A map of table names to Drizzle table objects. */
export type SchemaMap = Record<string, any>

// ------------------------------------------------------------ Helpers --

/**
 * Check if an exported value looks like a Storium TableDef or Store.
 * We detect by the presence of `.table` (Drizzle table) and `.name` (table name).
 */
const isTableDef = (value: any): boolean =>
  value !== null &&
  typeof value === 'object' &&
  'table' in value &&
  'name' in value &&
  typeof value.name === 'string'

// --------------------------------------------------------- Public API --

/**
 * Collect all Drizzle table objects from schema files matching the given globs.
 *
 * @param patterns - Glob pattern(s) for schema files (string or array)
 * @param cwd - Working directory for glob resolution (default: process.cwd())
 * @returns A flat map of table names to Drizzle table objects
 */
export const collectSchemas = async (
  patterns: string | string[],
  cwd: string = process.cwd()
): Promise<SchemaMap> => {
  const globPatterns = Array.isArray(patterns) ? patterns : [patterns]
  const schemaMap: SchemaMap = {}

  // Resolve all matching files
  const files: string[] = []

  for (const pattern of globPatterns) {
    const matches = await glob(pattern, { cwd, absolute: true })
    files.push(...matches)
  }

  // Deduplicate
  const uniqueFiles = [...new Set(files)]

  // Import each file and extract TableDefs/Stores
  for (const filePath of uniqueFiles) {
    try {
      const mod = await import(filePath)

      for (const [exportName, exportValue] of Object.entries(mod)) {
        if (isTableDef(exportValue)) {
          const tableDef = exportValue as { table: any; name: string }
          schemaMap[tableDef.name] = tableDef.table
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(
        `[storium] Warning: Failed to import schema file '${filePath}': ${message}`
      )
    }
  }

  return schemaMap
}

/**
 * Collect schemas and return them in the format drizzle-kit expects:
 * a single object with all table definitions as values.
 *
 * This is used as the `schema` input for drizzle-kit's programmatic API.
 */
export const collectDrizzleSchema = async (
  patterns: string | string[],
  cwd?: string
): Promise<Record<string, any>> => {
  return collectSchemas(patterns, cwd)
}
