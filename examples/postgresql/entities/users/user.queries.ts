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

// Uses includeWriteOnly to read password_hash (normally excluded from SELECTs)
export const authenticate = (ctx: Ctx) => async (email: string, password: string) => {
  const user = await ctx.findOne({ email }, { includeWriteOnly: true })
  if (!user) return null

  // In a real app: await bcrypt.compare(password, user.password_hash)
  const matches = password === user.password_hash
  return matches ? user : null
}
