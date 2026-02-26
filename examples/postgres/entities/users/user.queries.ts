import { ilike, or } from 'drizzle-orm'
import type { CustomQueryFn } from 'storium'

export const findByEmail: CustomQueryFn = (ctx) => async (email: string) =>
  ctx.findOne({ email })

export const search: CustomQueryFn = (ctx) => async (term: string) =>
  ctx.db
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(or(
      ilike(ctx.table.email, `%${term}%`),
      ilike(ctx.table.name, `%${term}%`),
    ))
