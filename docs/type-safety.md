# Type Safety in Storium

Storium wraps Drizzle ORM tables with validation, access control, and CRUD operations. This document explains what is statically typed, what remains `any`, and why.

The type system was substantially tightened so that custom-query signatures, CRUD row types, dialect-aware `ctx`, soft-delete methods, `StoreConfig` column keys, and relationship-mixin join results all flow through end to end. The guarantees below are locked in by `expectTypeOf` tests in `src/store/__tests__/typed-store.test.ts` and `src/mixins/__tests__/typed-mixins.test.ts`, enforced by `npm run typecheck`.

## What's typed

**Drizzle table definitions** are fully typed. `pgTable()`, `sqliteTable()`, and `mysqlTable()` produce typed column maps, and Drizzle's `InferSelectModel<T>` / `InferInsertModel<T>` utilities derive row types from those definitions.

**Column introspection** lives in `src/schema/zod.ts` (`drizzleColumnToZod`, `buildZodSchemas`, `buildSchemaSet`) and `src/schema/json.ts` (`drizzleColumnToJsonSchema`, `buildJsonSchemas`). It reads Drizzle column metadata at runtime (`dataType`, `columnType`, `notNull`, `hasDefault`, `length`, `enumValues`) and maps it to Zod schemas and JSON Schema objects. The introspection input is typed via the `DrizzleColumn` interface in `src/types.ts`. (There is no separate `introspect.ts` — the mapping is co-located with each schema generator.)

**Config and options** — `StoriumConfig`, `StoreConfig<TTable>`, `ColumnAnnotation`, `QueryOptions<TTable>`, `PrepOptions<TTable>`, and `OrderBySpec` are all typed. The `where` callback receives the typed table and returns `SQL | undefined` (from `drizzle-orm`).

**Dialect-aware database types** — `DrizzleDatabase<D>` resolves to the concrete Drizzle class (`PgDatabase`, `MySqlDatabase`, `BaseSQLiteDatabase`) when `D` is a specific dialect literal, providing full autocomplete inside custom queries.

**Public store methods** — `find`, `findById`, `create`, etc. return rows derived from the bound table (`InferRow<TTable>`), and their `where` callbacks receive the typed table.

**Custom query context** — `RepositoryContext<D, TTable, TSoftDelete>` (aliased as `Ctx`) types the `ctx` object passed to custom query factories, including the dialect-aware `drizzle`, typed CRUD, typed `ctx.table`, and `ctx.schemas`.

**Schema validation** — `schemas.createSchema.validate()` (and the other `RuntimeSchema` variants) return the table's model type rather than `any`.

**Transaction handle** — `db.transaction(async (tx) => ...)` types `tx` as `DrizzleDatabase<D>`.

## Inference behavior (what flows through, with examples)

These are the behaviors most likely to surprise you in a good way. Each maps to a guarantee in `typed-store.test.ts`.

### 1. Table → dialect inference

A Drizzle table's *flavor* pins its dialect, so `ctx` is concrete even in the inert multi-file definition — before any connection exists:

```typescript
export type InferTableDialect<TTable> =
  TTable extends PgTable      ? 'postgresql'
  : TTable extends MySqlTable ? 'mysql'
  : TTable extends SQLiteTable ? 'sqlite' | 'memory'
  : Dialect
```

```typescript
// pgUsers is a pgTable → ctx.drizzle is PgDatabase, not any
defineStore(pgUsers).queries({
  search: (ctx) => async (email: string) => {
    ctx.drizzle          // PgDatabase<any, any, any>
    const row = await ctx.findOne({ email })
    row!.email           // string  (inferred from the table)
    return row
  },
})
```

> **Dialect-mismatch caveat (type-level only).** Because the dialect is inferred from the table flavor, using a `pgTable` against a `memory`/SQLite connection gives you **pg-typed** `ctx.drizzle` at compile time. This is a purely static approximation — there is no runtime effect — but it can surface in tests/examples that deliberately mix a Postgres-flavored table with the in-memory dialect. If you mix flavors on purpose, treat `ctx.drizzle`'s class as advisory.

### 2. Custom query signatures survive end to end

`.queries()` infers the whole function record, so each query's parameter list and return type are preserved onto the live store — through both `register()` and `db.defineStore().queries()`:

```typescript
const def = defineStore(usersTable).queries({
  findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
  countActive: (ctx) => async (minAge: number, flag: boolean) => ctx.count({ age: minAge }),
})

type UsersStore = InferStore<typeof def>
//   UsersStore['findByEmail'] : (email: string) => Promise<Row | null>
//   UsersStore['countActive'] : (minAge: number, flag: boolean) => Promise<number>
//   plus all default CRUD, still typed
```

`ctx` is still contextually typed inside an unannotated `(ctx) => ...` factory — the typing flows from the generic constraint, so you do not have to annotate `ctx` yourself.

### 3. Soft-delete methods are visible when `softDelete: true`

A store created with `softDelete: true` exposes the soft-delete surface (`restore`, `forceDestroy`, `forceDestroyAll`, `findWithDeleted`, `countWithDeleted`) on the store type **and** on `ctx`; a plain store does not (accessing them is a compile error):

```typescript
const sd = db.defineStore(pgUsers, { softDelete: true })  // pgUsers has a deletedAt column
await sd.restore(id)            // ✅ typed

const plain = db.defineStore(pgUsers)
plain.restore(id)              // ❌ compile error — no such method

// inside a custom query, ctx mirrors the store:
defineStore(pgSdUsers, { softDelete: true }).queries({
  revive: (ctx) => async (id: string) => ctx.restore(id),  // ✅ ctx.restore typed
})
```

The literal `softDelete: true` is captured via overloads on `defineStore` / `StoriumInstance.defineStore`, so you get this without annotating a config type.

### 4. `StoreConfig.columns` keys are typed

`columns` keys are constrained to the table's actual columns. Valid keys autocomplete; typos are compile errors (with `validateAnnotations` still the runtime backstop):

```typescript
defineStore(usersTable, { columns: { email: { required: true } } })   // ✅
defineStore(usersTable, { columns: { emial: { required: true } } })   // ❌ 'emial' is not a column
```

### 5. Mixin join results are typed

The relationship mixins derive their result row from the related table type, the `alias`, and the `select` option — so the generated method returns a typed row instead of `Promise<any>`. `select` is captured as a `const` tuple, so it narrows the row to exactly the chosen columns; omit it for the full related row.

```typescript
const authorStore = defineStore(authorsTable)   // { id, name, email }

const posts = db.defineStore(postsTable).queries({
  ...belongsTo(authorStore.table, 'author_id', { alias: 'author', select: ['name', 'email'] }),
  ...hasMany(commentStore.table, 'post_id', { alias: 'comments' }),
})

const joined = await posts.findWithAuthor(id)
//    joined.author_name   : string        (related column, prefixed by alias)
//    joined.author_email  : string
//    joined.title         : unknown       (parent column — see note)

const comments = await posts.findCommentsFor(id)
//    comments : InferSelectModel<typeof commentsTable>[]
```

`belongsTo` inlines the parent entity's own columns alongside the alias-prefixed related columns, but the mixin can't see the parent table's type (`ctx` is `any` internally), so parent columns are typed `unknown` via an open index signature. `hasMany`/`hasOne` return the related row directly (no prefix); `withMembers`' `addMember`/`getMembers` return the join-table row. These guarantees are covered by `expectTypeOf` tests in `src/mixins/__tests__/typed-mixins.test.ts`.

## Intentional `any` — and why

A handful of `any`s remain on purpose. They fall into two buckets: deliberate looseness at composition boundaries, and Drizzle internals that aren't publicly typed.

### Public row types still include hidden columns

`hidden: true` strips a column from SELECT results at runtime, but the public row type still lists it. Excluding hidden columns from the static row type needs the per-column `hidden` *literals* captured as types and `Omit`ted from the row — deferred (it multiplies type complexity and collides with the `includeHidden` escape hatch, which returns the full row). So `findOne()` may still type a `password` field the runtime actually strips. Treat hidden columns as "present in the type, absent at runtime" for now.

### Standalone (bare `Ctx`) query files

A query factory written in its own file and typed as `(ctx: Ctx) => ...` — with no table/dialect bound — intentionally gets the loose end of the union: `ctx.drizzle` is `any` and soft-delete methods are absent (the soft-delete flag defaults to `false`). This is the same accepted looseness as any unparameterized generic. Bind the table (use the inline `.queries()` form, or a parameterized `Ctx<D, TTable>`) when you want the precise surface.

### Mixin `ctx: any` (internal only)

`belongsTo`, `hasMany`, `hasOne`, and `withMembers` use `ctx: any` *internally* — the query factories take `(ctx: any) => …` so the mixin modules don't have to import `RepositoryContext` from `types.ts`, which would create a circular import (`types.ts` → mixins → `types.ts`). At runtime `ctx` is always a `RepositoryContext`. This is the only `any` the mixins still carry; their **results are typed** (see [§5 below](#5-mixin-join-results-are-typed)).

### Query builder variables (`q: any`)

`applyOrderBy(q, ...)` / `applyQueryOpts(q, ...)` in `repository.ts` accept `q: any`. Drizzle's fluent query builder type varies by dialect (`PgSelectBase`, `SQLiteSelectBase`, `MySQLSelectBase`) and is not exported as a unified interface. All dialects expose `.orderBy()`, `.limit()`, and `.offset()`, so the runtime calls are safe.

### `(result as any).insertId`

Drizzle's MySQL insert result exposes `insertId` for auto-increment primary keys, but the result type is not publicly exported. This cast is the only way to retrieve auto-increment PKs on MySQL (which lacks `RETURNING`).

### `(row as any)[primaryKey]`

Dynamic property access on result rows using a runtime PK column name, since the projection depends on the table.

### `TableDef` index signature

`TableDef` has `[key: string]: any` because it represents a Drizzle table object whose column properties are dynamically named (kept for internal/runtime use). Note that `ctx.table` is the precise `TTable & { storium: StoriumMeta }`, not `TableDef` — dynamic string indexing on `ctx.table` therefore needs an explicit cast, by design.

## Remaining future work

- **Hidden-column projection** — `Omit` hidden columns from public row types (needs literal `hidden` capture; tension with `includeHidden`).

Best done while pre-1.0 breaking changes are still free, but after the core type chain (delivered here) has settled. (Typed mixin results — [§5 above](#5-mixin-join-results-are-typed) — are now done.)
