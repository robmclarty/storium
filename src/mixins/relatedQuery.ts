/**
 * @module relatedQuery
 *
 * Shared helper for hasMany and hasOne mixins. Builds select objects and
 * WHERE conditions for related-table queries.
 */

import { eq, and } from 'drizzle-orm'
import type { TableDef } from '../core/types'

/**
 * Build a column select object for a related table query.
 */
export function buildRelatedSelect(
  relatedTable: TableDef,
  columns: string[]
): Record<string, any> {
  const selectObj: Record<string, any> = {}
  for (const col of columns) {
    if (col in relatedTable) {
      selectObj[col] = relatedTable[col]
    }
  }
  return selectObj
}

/**
 * Build a WHERE clause for a related table query, combining
 * the foreign key condition with an optional where callback.
 */
export function buildRelatedWhere(
  relatedTable: TableDef,
  foreignKey: string,
  id: string | number,
  opts?: { where?: (t: any) => any }
) {
  const conditions = [eq(relatedTable[foreignKey], id)]
  if (opts?.where) conditions.push(opts.where(relatedTable))
  return conditions.length === 1 ? conditions[0] : and(...conditions)
}

/**
 * Capitalize the first letter of a string for method name generation.
 * 'posts' → 'Posts', 'profile' → 'Profile'
 */
function capitalizeAlias(alias: string): string {
  return alias.charAt(0).toUpperCase() + alias.slice(1)
}

/**
 * Extract common setup for hasMany/hasOne: resolve table, method name,
 * and selectable columns from options.
 */
export function prepareRelatedMixin(
  relatedTableDef: TableDef,
  options: { alias: string; select?: string[] }
) {
  return {
    relatedTable: relatedTableDef,
    methodName: `find${capitalizeAlias(options.alias)}For`,
    columns: options.select ?? relatedTableDef.storium.access.selectable,
  }
}
