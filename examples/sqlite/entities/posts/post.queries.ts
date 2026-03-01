import { sql } from 'drizzle-orm'

export const findByAuthor = (ctx) => async (authorId: string) =>
  ctx.find({ author_id: authorId })

export const findPublished = (ctx) => async () =>
  ctx.find({ status: 'published' })

export const publish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'published' })

export const unpublish = (ctx) => async (id: string) =>
  ctx.update(id, { status: 'draft' })

// SQLite: no @> operator — use json_each() to search within JSON array
export const findByTag = (ctx) => async (tag: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`EXISTS (SELECT 1 FROM json_each(${ctx.table.tags}) WHERE value = ${tag})`)

// SQLite: use json_extract() on both sides so types match.
// json_extract('{"a":true}','$.a') returns integer 1, and
// json_extract('"hello"','$') returns text 'hello' — so both
// sides go through the same type coercion.
export const findByMetadata = (ctx) => async (key: string, value: string) =>
  ctx.drizzle
    .select(ctx.selectColumns)
    .from(ctx.table)
    .where(sql`json_extract(${ctx.table.metadata}, '$.' || ${key}) = json_extract(${value}, '$')`)
