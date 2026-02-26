import { eq, sql } from 'drizzle-orm'
import type { CustomQueryFn } from 'storium'

export const findByAuthor: CustomQueryFn = (ctx) => async (authorId: string) =>
  ctx.find({ author_id: authorId })

export const findPublished: CustomQueryFn = (ctx) => async () =>
  ctx.find({ status: 'published' })

export const publish: CustomQueryFn = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'published' })

export const unpublish: CustomQueryFn = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'draft' })

// Postgres-specific: array containment with @> operator
export const findByTag: CustomQueryFn = (ctx) => async (tag: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`${ctx.table.tags} @> ARRAY[${tag}]::text[]`)

// Postgres-specific: query JSONB fields
export const findByMetadata: CustomQueryFn = (ctx) => async (key: string, value: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(eq(sql`${ctx.table.metadata} ->> ${key}`, value))
