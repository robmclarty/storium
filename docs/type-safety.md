# Type Safety in Storium

Storium wraps Drizzle ORM tables with validation, access control, and CRUD operations. This document explains what is statically typed, what remains `any`, and why.

The type system was substantially tightened so that custom-query signatures, CRUD row types, dialect-aware `ctx`, soft-delete methods, `StoreConfig` column keys, and hidden-column projection all flow through end to end. The guarantees below are locked in by `expectTypeOf` tests in `src/store/__tests__/typed-store.test.ts`, enforced by `npm run typecheck`.

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

### 5. Hidden columns are omitted from public row types

`hidden: true` strips a column from SELECT results at runtime; the public store row types now omit it too. The `hidden: true` literal is captured by a `const` config type parameter on `defineStore` / `db.defineStore` (`HiddenKeys`), and those columns are `Omit`ted from the row returned by every public method (`find`, `findOne`, `create`, `update`, `restore`, …):

```typescript
const users = db.defineStore(usersTable, { columns: { password: { hidden: true } } })

const row = await users.findOne({ email })
row!.email      // string
row!.password   // ❌ compile error — Property 'password' does not exist on Omit<…, "password">
```

Two deliberate boundaries:

- **Inputs keep hidden columns.** `hidden: true` implies writable, so `create()`/`update()` still accept `password` — only the returned rows strip it.
- **`ctx` CRUD keeps the full row.** Inside custom queries the row type still includes hidden columns, because the `includeHidden: true` escape hatch lives on `PrepOptions` (the `ctx` surface), not the public `QueryOptions`. This is the place that legitimately needs the hash — e.g. authentication.

```typescript
defineStore(usersTable, { columns: { password: { hidden: true } } }).queries({
  authenticate: (ctx) => async (email: string, pw: string) => {
    const row = await ctx.findOne({ email }, { includeHidden: true })
    return row && verify(pw, row.password)   // ✅ ctx row still types `password`
  },
})
```

> **Limitation.** Only `columns.<col>.hidden: true` is captured. A column hidden via table-level access overrides is still stripped at runtime but not reflected in the type.

## Intentional `any` — and why

A handful of `any`s remain on purpose. They fall into two buckets: deliberate looseness at composition boundaries, and Drizzle internals that aren't publicly typed.

### Standalone (bare `Ctx`) query files

A query factory written in its own file and typed as `(ctx: Ctx) => ...` — with no table/dialect bound — intentionally gets the loose end of the union: `ctx.drizzle` is `any` and soft-delete methods are absent (the soft-delete flag defaults to `false`). This is the same accepted looseness as any unparameterized generic. Bind the table (use the inline `.queries()` form, or a parameterized `Ctx<D, TTable>`) when you want the precise surface.

### Mixin return types (`Promise<any>`)

`belongsTo`, `hasMany`, `hasOne`, and `withMembers` type their method *names* via template literals but return `(id) => Promise<any>`. Typing the join result as a mapped type with prefixed keys is feasible but was deferred to a focused follow-up; the mixins also use `ctx: any` internally to avoid circular imports between `types.ts` and the mixin modules. At runtime `ctx` is always a `RepositoryContext`.

### Query builder variables (`q: any`)

`applyOrderBy(q, ...)` / `applyQueryOpts(q, ...)` in `repository.ts` accept `q: any`. Drizzle's fluent query builder type varies by dialect (`PgSelectBase`, `SQLiteSelectBase`, `MySQLSelectBase`) and is not exported as a unified interface. All dialects expose `.orderBy()`, `.limit()`, and `.offset()`, so the runtime calls are safe.

### `(result as any).insertId`

Drizzle's MySQL insert result exposes `insertId` for auto-increment primary keys, but the result type is not publicly exported. This cast is the only way to retrieve auto-increment PKs on MySQL (which lacks `RETURNING`).

### `(row as any)[primaryKey]`

Dynamic property access on result rows using a runtime PK column name, since the projection depends on the table.

### `TableDef` index signature

`TableDef` has `[key: string]: any` because it represents a Drizzle table object whose column properties are dynamically named (kept for internal/runtime use). Note that `ctx.table` is the precise `TTable & { storium: StoriumMeta }`, not `TableDef` — dynamic string indexing on `ctx.table` therefore needs an explicit cast, by design.

## Remaining future work

- **Typed mixin results** — derive the join row shape (`InferRow<TTable> & prefixed related columns`) for `belongsTo`/`hasMany`/`hasOne`/`withMembers`.

Best done while pre-1.0 breaking changes are still free, but after the core type chain (delivered here) has settled. (Hidden-column projection — [§5 above](#5-hidden-columns-are-omitted-from-public-row-types) — is now done.)
