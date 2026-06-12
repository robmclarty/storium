/**
 * @module relation-types
 *
 * Compile-time helpers shared by the relationship mixins (`belongsTo`,
 * `hasMany`, `hasOne`, `withMembers`). They recover the related/join row shape
 * from the related Drizzle table type and the `select` option, so mixin methods
 * return a typed row instead of `Promise<any>`.
 *
 * These are type-only. At runtime the mixins still treat the related table as a
 * loose `TableDef` and pass `ctx: any` — see each mixin's `@remarks`. The mixins
 * deliberately do **not** constrain their table parameter to `extends Table`:
 * existing call sites cast a raw Drizzle table with `as unknown as TableDef`,
 * and `RowOf` degrades gracefully for that case while staying precise when a
 * real table type is supplied (e.g. `defineStore(...).table`).
 */

import type { Table, InferSelectModel } from 'drizzle-orm'

/**
 * The SELECT row of a related table, or a loose record when the argument isn't
 * a concrete Drizzle table (e.g. a `TableDef` cast). This is what lets the
 * mixins accept their table without an `extends Table` constraint: a real table
 * yields its `InferSelectModel`; anything else falls back to an open record.
 */
export type RowOf<TRelated> =
  TRelated extends Table ? InferSelectModel<TRelated> : Record<string, unknown>

/**
 * The related columns chosen by a mixin's `select` option, with their value
 * types. `select` is captured as a `const` tuple, so `select: ['name', 'email']`
 * narrows to exactly those columns; when omitted (`S = undefined`) all of the
 * related table's columns are included. Unknown column names are intersected
 * away rather than producing an error (the runtime validates them).
 */
export type SelectedRow<TRelated, S extends readonly string[] | undefined> =
  S extends readonly string[]
    ? { [K in Extract<keyof RowOf<TRelated>, S[number]>]: RowOf<TRelated>[K] }
    : RowOf<TRelated>

/**
 * A `belongsTo` join row: each selected related column prefixed by the alias
 * (`${alias}_${column}`), intersected with an open record for the parent
 * entity's own inlined columns. The parent table type isn't visible to the
 * mixin — `ctx` is intentionally `any` — so its columns stay loosely typed
 * (`unknown`) while the joined related columns are fully typed.
 */
export type PrefixedRow<
  TRelated,
  A extends string,
  S extends readonly string[] | undefined,
> = {
  [K in keyof SelectedRow<TRelated, S> & string as `${A}_${K}`]: SelectedRow<TRelated, S>[K]
} & { [column: string]: unknown }
