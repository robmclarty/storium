import { eq, sql } from 'drizzle-orm'

export const findByAuthor = (ctx) => async (authorId: string) =>
  ctx.find({ author_id: authorId })

export const findPublished = (ctx) => async () =>
  ctx.find({ status: 'published' })

export const publish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'published' })

export const unpublish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'draft' })

// Postgres-specific: array containment with @> operator
export const findByTag = (ctx) => async (tag: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`${ctx.table.tags} @> ARRAY[${tag}]::text[]`)

// Postgres-specific: query JSONB fields
export const findByMetadata = (ctx) => async (key: string, value: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(eq(sql`${ctx.table.metadata} ->> ${key}`, value))
