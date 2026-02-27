import { ilike, or } from 'drizzle-orm'
import type { Ctx } from 'storium'

export const findByEmail = (ctx: Ctx) => async (email: string) =>
  ctx.findOne({ email })

export const search = (ctx: Ctx) => async (term: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(or(
      ilike(ctx.table.email, `%${term}%`),
      ilike(ctx.table.name, `%${term}%`),
    ))
