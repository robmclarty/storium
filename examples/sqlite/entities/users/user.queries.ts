import { like, or } from 'drizzle-orm'
import type { Ctx } from 'storium'

export const findByEmail = (ctx: Ctx) => async (email: string) =>
  ctx.findOne({ email })

// SQLite: LIKE is case-insensitive for ASCII by default (no ILIKE needed)
export const search = (ctx: Ctx) => async (term: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(or(
      like(ctx.table.email, `%${term}%`),
      like(ctx.table.name, `%${term}%`),
    ))

// Uses includeWriteOnly to read password_hash (normally excluded from SELECTs)
export const authenticate = (ctx: Ctx) => async (email: string, password: string) => {
  const user = await ctx.findOne({ email }, { includeWriteOnly: true })
  if (!user) return null

  // In a real app: await bcrypt.compare(password, user.password_hash)
  const matches = password === user.password_hash
  return matches ? user : null
}
