import { like, or } from 'drizzle-orm'

export const findByEmail = (ctx) => async (email: string) =>
  ctx.findOne({ email })

// SQLite: LIKE is case-insensitive for ASCII by default (no ILIKE needed)
export const search = (ctx) => async (term: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(or(
      like(ctx.table.email, `%${term}%`),
      like(ctx.table.name, `%${term}%`),
    ))

// Uses includeHidden to read password_hash (normally excluded from SELECTs)
export const authenticate = (ctx) => async (email: string, password: string) => {
  const user = await ctx.findOne({ email }, { includeHidden: true })
  if (!user) return null

  // In a real app: await bcrypt.compare(password, user.password_hash)
  const matches = password === user.password_hash
  return matches ? user : null
}
