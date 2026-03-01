import { sql } from 'drizzle-orm'

export const findByAuthor = (ctx) => async (authorId: string) =>
  ctx.find({ author_id: authorId })

export const findPublished = (ctx) => async () =>
  ctx.find({ status: 'published' })

export const publish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'published' })

export const unpublish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'draft' })

// MySQL: use JSON_CONTAINS() to search within JSON arrays
export const findByTag = (ctx) => async (tag: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`JSON_CONTAINS(${ctx.table.tags}, JSON_QUOTE(${tag}))`)

// MySQL: use JSON_EXTRACT() to query JSON fields.
// CAST(value AS JSON) ensures correct type comparison (e.g. true vs "true").
export const findByMetadata = (ctx) => async (key: string, value: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`JSON_EXTRACT(${ctx.table.metadata}, CONCAT('$.', ${key})) = CAST(${value} AS JSON)`)
