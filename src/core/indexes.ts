/**
 * Storium v1 — Index DSL
 *
 * Builds Drizzle index definitions from Storium's index config. Handles
 * auto-naming conventions, single-column shorthand, composite indexes,
 * partial indexes, and raw Drizzle escape hatches.
 *
 * Naming conventions:
 * - Regular index: `{table}_{keyName}_idx`
 * - Unique index: `{table}_{keyName}_unique`
 * - Explicit `name` overrides auto-naming
 *
 * @example
 * indexes: {
 *   email: { unique: true },                          // → users_email_unique on (email)
 *   school_id: {},                                     // → users_school_id_idx on (school_id)
 *   school_role: { columns: ['school_id', 'role'] },   // → users_school_role_idx
 *   custom: { columns: ['a', 'b'], name: 'my_idx' },   // → my_idx on (a, b)
 *   search: { raw: (t) => index('search_gin').using('gin', t.vec) },
 * }
 */

import type { Dialect, IndexesConfig, DslIndexConfig, ColumnsConfig } from './types'
import { isRawIndex } from './types'
import { SchemaError } from './errors'

// ------------------------------------------------------------- Helpers --

/**
 * Generate the conventional index name from table name, key name, and uniqueness.
 */
const autoName = (tableName: string, keyName: string, unique: boolean): string =>
  unique
    ? `${tableName}_${keyName}_unique`
    : `${tableName}_${keyName}_idx`

/**
 * Resolve which columns an index covers. If `columns` is specified, use those.
 * Otherwise, use the key name as a single-column reference and validate it
 * exists in the schema.
 */
const resolveColumns = (
  keyName: string,
  config: DslIndexConfig,
  schemaColumns: ColumnsConfig,
  tableName: string
): string[] => {
  if (config.columns && config.columns.length > 0) {
    // Validate all referenced columns exist in the schema
    for (const col of config.columns) {
      if (!(col in schemaColumns)) {
        throw new SchemaError(
          `Index '${keyName}' on table '${tableName}' references column '${col}' ` +
          `which is not defined in the schema`
        )
      }
    }
    return config.columns
  }

  // Single-column shorthand: key name must match a column
  if (!(keyName in schemaColumns)) {
    throw new SchemaError(
      `Index '${keyName}' on table '${tableName}': no 'columns' specified and ` +
      `no column named '${keyName}' exists. Either specify 'columns' explicitly ` +
      `or use a key name that matches a column.`
    )
  }

  return [keyName]
}

// ---------------------------------------------------------- Public API --

/**
 * Build Drizzle index definitions from the Storium index config.
 * Returns a function compatible with Drizzle's table third-argument callback.
 *
 * @param tableName - The table name (for auto-naming)
 * @param indexesConfig - The user's index definitions
 * @param schemaColumns - The column definitions (for validation)
 * @param dialect - The active dialect
 * @returns A function `(table) => Record<string, Index>` for Drizzle's pgTable
 */
export const buildIndexes = (
  tableName: string,
  indexesConfig: IndexesConfig,
  schemaColumns: ColumnsConfig,
  dialect: Dialect
): ((table: any) => Record<string, any>) => {

  return (table: any) => {
    const result: Record<string, any> = {}

    // Lazily load the dialect-specific index/uniqueIndex functions
    let indexFn: any
    let uniqueIndexFn: any

    switch (dialect) {
      case 'postgresql': {
        const pg = require('drizzle-orm/pg-core')
        indexFn = pg.index
        uniqueIndexFn = pg.uniqueIndex
        break
      }
      case 'mysql': {
        const mysql = require('drizzle-orm/mysql-core')
        indexFn = mysql.index
        uniqueIndexFn = mysql.uniqueIndex
        break
      }
      case 'sqlite':
      case 'memory': {
        const sqlite = require('drizzle-orm/sqlite-core')
        indexFn = sqlite.index
        uniqueIndexFn = sqlite.uniqueIndex
        break
      }
    }

    for (const [keyName, config] of Object.entries(indexesConfig)) {
      // Raw escape hatch — user provides the full Drizzle index
      if (isRawIndex(config)) {
        result[keyName] = config.raw(table)
        continue
      }

      // DSL path
      const dslConfig = config as DslIndexConfig
      const isUnique = dslConfig.unique ?? false
      const columns = resolveColumns(keyName, dslConfig, schemaColumns, tableName)
      const name = dslConfig.name ?? autoName(tableName, keyName, isUnique)

      // Build the index using the appropriate function
      const createIdx = isUnique ? uniqueIndexFn : indexFn
      let idx = createIdx(name).on(
        ...columns.map(col => {
          if (!(col in table)) {
            throw new SchemaError(
              `Index '${keyName}' on table '${tableName}': column '${col}' ` +
              `not found on Drizzle table object`
            )
          }
          return table[col]
        })
      )

      // Partial index (WHERE clause) — primarily PostgreSQL
      if (dslConfig.where) {
        idx = idx.where(dslConfig.where(table))
      }

      result[keyName] = idx
    }

    return result
  }
}
