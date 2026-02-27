/**
 * @module schemaCollector
 *
 * Collects Drizzle table objects from Storium schema files. Used by the CLI
 * and programmatic migration API to build the schema map that drizzle-kit
 * diffs against the database.
 *
 * Scans files matching glob patterns from the config, imports them, and
 * extracts Drizzle tables from storium-defined exports (via `.storium`
 * metadata on tables, or `__storeDefinition` on store definitions).
 *
 * @example
 * const tables = await collectSchemas([
 *   './src/entities/**\/*.schema.ts',
 *   './src/collections/**\/*.schema.ts',
 * ])
 * // { users: <DrizzleTable>, teams: <DrizzleTable>, ... }
 */

import { glob } from 'glob'
import { hasMeta } from '../core/defineTable'

// --------------------------------------------------------------- Types --

/** A map of table names to Drizzle table objects. */
export type SchemaMap = Record<string, any>

// --------------------------------------------------------- Public API --

/**
 * Collect all Drizzle table objects from schema files matching the given globs.
 *
 * Uses dynamic `import()` to load schema files at runtime. If your schema
 * files are TypeScript (`.ts`), the runtime must support TypeScript imports
 * — e.g., via `tsx`, `ts-node`, or Node.js 22+ with `--experimental-strip-types`.
 * Pre-compiled `.js` files work in any Node.js environment.
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

      for (const [_exportName, exportValue] of Object.entries(mod)) {
        // Case 1: Plain storium table (from defineTable)
        if (hasMeta(exportValue)) {
          schemaMap[(exportValue as any).storium.name] = exportValue
          continue
        }
        // Case 2: StoreDefinition (from defineStore)
        if (
          exportValue !== null &&
          typeof exportValue === 'object' &&
          (exportValue as any).__storeDefinition === true
        ) {
          const def = exportValue as { table: any; name: string }
          schemaMap[def.name] = def.table
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
