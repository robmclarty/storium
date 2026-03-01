import { eq, sql } from 'drizzle-orm'
import type { Ctx } from 'storium'

export const findByAuthor = (ctx: Ctx) => async (authorId: string) =>
  ctx.find({ author_id: authorId })

export const findPublished = (ctx: Ctx) => async () =>
  ctx.find({ status: 'published' })

export const publish = (ctx: Ctx) => async (id: string) =>
  ctx.update(id, { status: 'published' })

export const unpublish = (ctx: Ctx) => async (id: string) =>
  ctx.update(id, { status: 'draft' })

// Postgres-specific: array containment with @> operator
export const findByTag = (ctx: Ctx) => async (tag: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`${ctx.table.tags} @> ARRAY[${tag}]::text[]`)

// Postgres-specific: query JSONB fields
export const findByMetadata = (ctx: Ctx) => async (key: string, value: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(eq(sql`${ctx.table.metadata} ->> ${key}`, value))
