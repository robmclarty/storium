/**
 * Storium v1 — withBelongsTo
 *
 * Composable "belongs to" join helper. Generates a `findWith{Alias}` query
 * that LEFT JOINs a related table and returns the entity with inlined
 * related fields.
 *
 * @example
 * const users = db.defineStore('users', columns, {
 *   queries: {
 *     ...withBelongsTo(schools, 'school_id', {
 *       alias: 'school',
 *       select: ['name', 'slug'],
 *     }),
 *   },
 * })
 *
 * const user = await users.findWithSchool(userId)
 * // { id, email, name, school_name, school_slug }
 */

import { eq } from 'drizzle-orm'
import type { TableDef, CustomQueryFn } from '../core/types'

type BelongsToOptions = {
  /** The alias for the related entity (used in the method name: findWith{Alias}). */
  alias: string
  /** Which columns to select from the related table. If omitted, uses all selectable columns. */
  select?: string[]
}

/**
 * Generate a "belongs to" join query for a related table.
 *
 * @param relatedTableDef - The TableDef of the related entity
 * @param foreignKey - The column on the current table referencing the related table's PK
 * @param options - Alias and optional column selection
 * @returns A custom query function to spread into queries
 */
export const withBelongsTo = (
  relatedTableDef: TableDef,
  foreignKey: string,
  options: BelongsToOptions
): Record<string, CustomQueryFn> => {
  const { alias, select: selectFields } = options
  const relatedTable = relatedTableDef.table
  const relatedPk = relatedTableDef.primaryKey

  // Capitalize first letter for method name: 'school' → 'findWithSchool'
  const methodName = `findWith${alias.charAt(0).toUpperCase()}${alias.slice(1)}`

  // Determine which related columns to include
  const relatedColumns = selectFields ?? relatedTableDef.access.selectable

  return {
    /**
     * Find an entity by ID with the related entity's fields inlined.
     * Uses a LEFT JOIN so the entity is returned even if the relation is null.
     */
    [methodName]: (ctx) => async (id: string | number) => {
      // Build the select object: entity's selectColumns + prefixed related columns
      const selectObj: Record<string, any> = { ...ctx.selectColumns }

      for (const col of relatedColumns) {
        if (col in relatedTable) {
          selectObj[`${alias}_${col}`] = relatedTable[col]
        }
      }

      const rows = await ctx.drizzle
        .select(selectObj)
        .from(ctx.table)
        .leftJoin(
          relatedTable,
          eq(ctx.table[foreignKey], relatedTable[relatedPk])
        )
        .where(eq(ctx.table[ctx.primaryKey], id))
        .limit(1)

      return rows[0] ?? null
    },
  }
}
