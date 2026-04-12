# Changelog

All notable changes to Storium are documented here.

This project uses [Semantic Versioning](https://semver.org/). Pre-1.0 releases may include breaking changes in minor versions.

## [0.13.1] — 2026-04-11

- Update documentation for 0.13.0 features (README, API reference, relationships)
- Fix `.gitignore` to only ignore `.claude/settings.local.json` instead of entire `.claude/` directory

## [0.13.0] — 2026-04-11

### Breaking
- **`withBelongsTo` renamed to `belongsTo`.** The `with` prefix was awkward for relationship mixins. Update imports: `import { belongsTo } from 'storium'`. The generated `findWith{Alias}` method name is unchanged.

### Added
- **`hasMany` relationship mixin** — one-to-many queries returning a flat array of related rows. `...hasMany(postsTable, 'author_id', { alias: 'posts' })` generates `findPostsFor(id, opts?)`. Supports `limit`, `offset`, `orderBy`, `where`, and `select` options.
- **`hasOne` relationship mixin** — one-to-one queries returning a single related row or null. `...hasOne(profilesTable, 'user_id', { alias: 'profile' })` generates `findProfileFor(id, opts?)`. Same options as `hasMany`.
- **Soft delete** — `.softDelete()` chain method on `defineTable`. Auto-injects a hidden `deletedAt` timestamp column. When enabled:
  - All read methods (`find`, `findAll`, `findOne`, `findById`, `findByIdIn`, `count`, `exists`) auto-filter `WHERE deletedAt IS NULL`.
  - `destroy()` and `destroyAll()` set `deletedAt` instead of deleting.
  - New methods: `restore(id)`, `forceDestroy(id)`, `forceDestroyAll(filters)`, `findWithDeleted(filters?)`.
- **`withPagination` mixin** — wraps any store with a `paginate(filters, { page, pageSize })` method. Returns `{ data, meta: { page, pageSize, total, totalPages } }`. Configurable default page size via `withPagination(store, { pageSize: 10 })`.
- **`PaginateOptions` and `PaginateResult` types** exported for consumers.

## [0.12.0] — 2026-04-11

### Breaking
- **`ctx.tableDef` removed.** Use `ctx.table` instead (they were identical references). `StoreDefinition.tableDef` is unchanged.

### Added
- **`count(filters?, opts?)`** — returns row count matching filters and/or `where` callback.
- **`exists(filters, opts?)`** — returns boolean existence check.
- **`createMany(inputs[], opts?)`** — bulk insert with per-row prep pipeline (transform, validate, required). Returns all inserted rows.
- **`upsert(input, opts?)`** — insert or update on conflict. Defaults to primary key; use `{ conflictTarget: ['email'] }` for unique columns. Automatically refreshes `updatedAt` when timestamps are enabled.
- **`where` callback on opts** — pass Drizzle expressions for conditions beyond equality: `find({}, { where: (t) => gt(t.age, 18) })`. Works on `find`, `findAll`, `findOne`, `destroyAll`, `count`, `exists`. AND'd with equality filters when both are present. `find({}, { where: ... })` is now valid (relaxes the "at least one filter" rule when `where` is provided).
- **`store.name`** — every store and repository now exposes its table name as a string property.
- **`conflictTarget` option** on `PrepOptions` for `upsert()` conflict column selection.

### Fixed
- **`withMembers.getMemberCount`** used raw `cast(count(*) as int)` SQL — PostgreSQL-only. Now uses drizzle-orm's dialect-agnostic `count()` function.
- **`withCache`** read `store.name` for cache invalidation prefix, but `Store` type had no `name` property — silently produced `unknown:*` as the prefix. Fixed by adding `name` to `Store` and `Repository` types and including it in repository output.
- **MySQL `array` type** silently fell back to JSON with no warning and `items` was ignored. Now emits a `console.warn` explaining the fallback.
- **CLI `require` in ESM** — the Bun re-exec block used bare `require('node:child_process')` which fails under `tsx`/ESM. Now uses `createRequire()` for ESM compatibility.

## [0.11.0] — 2026-02-28

### Breaking
- **`default: 'random_uuid'` renamed to `default: 'uuid:v4'`.** The colon convention distinguishes dynamic generators from literal default values. Update all column definitions accordingly.

### Added
- **UUIDv7 support** — `default: 'uuid:v7'` generates RFC 9562 UUIDv7 values with temporal sortability and better B-tree index performance (append-mostly inserts, fewer page splits). Includes a monotonic counter (§6.2) for strict ordering within the same millisecond.
- PostgreSQL example updated to use `uuid:v7` for primary keys.

## [0.10.0] — 2026-02-28

### Breaking
- **`defineTable` now uses chain API.** Positional params replaced by named chain methods:
  - Old: `defineTable('users', columns, { timestamps: false, indexes: {...} })`
  - New: `defineTable('users').columns(columns).timestamps(false).indexes({...})`
  - All three overloads updated (direct, curried dialect, no-arg)
  - New chain methods: `.indexes()`, `.access()`, `.primaryKey()`, `.timestamps(false)`
- **`defineStore` now uses `.queries()` chain.** Queries moved from second param to chain method:
  - Old: `defineStore(usersTable, { search, findByEmail })`
  - New: `defineStore(usersTable).queries({ search, findByEmail })`
  - `defineStore(usersTable)` without queries remains unchanged
- **`db.defineTable()` and `db.defineStore()`** follow the same chain patterns
- **`StoreDefinition.queries`** renamed to **`StoreDefinition.queryFns`** to avoid collision with `.queries()` chain method
- **`InferStore`** now reads `queryFns` instead of `queries`
- **`TableOptions`** deprecated in favor of chain methods; kept as `TableBuilderConfig` alias

### Added
- `AccessConfig` type for table-level access overrides (`.access({ hidden: [...], readonly: [...] })`)
- `.access()` chain method unions with per-column `hidden`/`readonly` settings
- `.queries()` chain method provides full `ctx` contextual typing — no more ts7006/ts7044 warnings on inline `(ctx) =>` callbacks
- Index auto-names now use snake_case: `schoolId: {}` → `users_school_id_idx`
- Tables without a primary key are now allowed (deferred to `.primaryKey()` chain or repository creation)

## [0.9.2] — 2026-02-28

### Fixed
- `withMembers()` methods now appear on `Store` type (removed `QueriesConfig` return annotation that erased literal keys)
- `withBelongsTo()` `findWith{Alias}` now appears on `Store` type via generic `A extends string` + template literal return type

### Changed
- Renamed `src/helpers/` → `src/mixins/` (better describes composable query sets that get mixed into stores)
- Expanded `Ctx` JSDoc with inline vs separate-file guidance

## [0.9.1] — 2026-02-28

### Changed
- `DrizzleDatabase<D>` falls back to `any` when `D` is the full `Dialect` union, so `StoriumInstance` and `Ctx` work without specifying a dialect param.
- Removed `ctx: Ctx` type annotations from all examples — plain `(ctx) =>` with inference is the recommended pattern. `Ctx` is still exported for users who want explicit typing.

### Added
- `from-drizzle` example: demonstrates `storium.fromDrizzle()` with `@libsql/client` — a different SQLite driver than the `better-sqlite3` Storium uses internally — proving driver-agnostic behavior.

## [0.9.0] — 2026-02-28

### Breaking
- **Column access model redesigned.** Three orthogonal flags replace the old `writeOnly` / `mutable` system:
  - `hidden` — excludes from SELECT results. Implies writable (e.g., password hashes). Replaces `writeOnly`.
  - `readonly` — excludes from INSERT and UPDATE. Always true for `primaryKey` columns. Replaces `mutable` with inverted semantics (columns are now writable by default — no flag needed).
  - `required` — must be provided on create. Unchanged.
  - Invalid combinations (`readonly + required`, `readonly + hidden`) now throw `SchemaError`.
- **`TableAccess` simplified.** Old `insertable` / `mutable` / `writeOnly` sets replaced with `selectable`, `writable`, `hidden`, `readonly`.
- **`PrepOptions` renamed.** `includeWriteOnly` → `includeHidden`, `onlyMutables` → `onlyWritable`.

### Added
- `DrizzleDatabase<D>` — generic type that resolves to the concrete Drizzle class (`PgDatabase`, `MySqlDatabase`, `BaseSQLiteDatabase`) when dialect `D` is known.
- `InferDialect<DB>` — reverse mapping from Drizzle instance type to dialect string.
- `StoriumInstance<D>` — now generic on dialect. `db.drizzle` resolves to the correct Drizzle type automatically.
- `StoriumConfig<D>` — preserves the literal dialect type for inference.
- `RepositoryContext<T, TColumns, D>` and `Ctx<T, TColumns, D>` — carry dialect generic for typed `ctx.drizzle`.
- `InferStore<T>` type — used by `register()` to preserve generic parameters on returned stores.
- Custom query methods now appear on the `Store` type with proper autocomplete.

### Changed
- `withBelongsTo` and `withMembers` helpers return `QueriesConfig` instead of `Record<string, CustomQueryFn>` (dialect-agnostic helpers don't need typed `ctx.drizzle`).
- `connect()` infers dialect from config literal: `storium.connect({ dialect: 'postgresql', ... })` → `StoriumInstance<'postgresql'>`.
- `fromDrizzle()` infers dialect from Drizzle instance type via `InferDialect<DB>`.

## [0.8.3] — 2026-02-28

### Added
- New documentation: `docs/column-naming.md` — explains camelCase/snake_case conventions, `dbName` override, timestamps, and raw columns.

## [0.8.2] — 2026-02-28

### Added
- Automatic camelCase → snake_case column name mapping: DSL keys like `inStock` produce `in_stock` in the database. Snake_case input is idempotent.
- `dbName` column property for explicit database column name override, bypassing auto-conversion.
- `TimestampColumns` type export — lets consumers reference the shape of injected timestamp columns.
- `ValidatorTest` type export — consumer-friendly alias for the `test` function signature in `validate` callbacks.
- `QueriesConfig` type export — proper callable constraint replacing `Record<string, Function>` for custom queries.
- `toSnakeCase()` utility export.

### Changed
- **Timestamps default to enabled (opt-out).** Omitting the `timestamps` option now injects `createdAt` / `updatedAt` columns automatically. Pass `{ timestamps: false }` to opt out.
- **Timestamp columns use camelCase keys.** `created_at` → `createdAt`, `updated_at` → `updatedAt` in app code (database columns remain `created_at` / `updated_at`).
- `BoundDefineTable`, `defineTable()`, and `StoriumInstance.defineTable` now use function overloads so the return type includes `TimestampColumns` when timestamps are enabled.

### Fixed
- `writeOnly` + `mutable` columns were incorrectly excluded from `insertable` and `mutable` runtime access lists. They can now be written via `create()` and `update()` as intended.
- Replaced all uses of the banned `Function` type with `QueriesConfig` — custom query methods now have a proper callable constraint in `Store`, `Repository`, and `StoreDefinition` types.

## [0.8.1] — 2026-02-28

### Added
- Composite primary key support.
- `dialect.ts` unit tests — all 13 DSL types across all 4 dialects (93 tests).

## [0.8.0] — 2026-02-28

### Added
- `toJsonSchema()` options: `properties`, `required`, `title`, `description`, `$id`.

## [0.7.10] — 2026-02-27

### Added
- Unit tests for all core modules, helpers, migrate modules, and `connect.ts` (168 tests across 17 files).
- New documentation: `custom-queries.md`, `validation.md`, `migrations.md`, `relationships.md`, `column-reference.md`.

## [0.7.9] — 2026-02-27

### Breaking
- **`SchemaSet` keys renamed** for ergonomic destructuring:
  - `insert` → `createSchema`
  - `update` → `updateSchema`
  - `select` → `selectSchema`
  - `full` → `fullSchema`

  Before: `users.schemas.insert.validate(data)`
  After: `const { createSchema } = users.schemas; createSchema.validate(data)`

- `examples/postgres` renamed to `examples/postgresql` to match the dialect name.

## [0.7.8] — 2026-02-27

### Added
- Relations example (`examples/relations/`) demonstrating `withBelongsTo`, `withMembers`, and custom JOINs with full generate/migrate workflow.
- `Promisable<T>` type on `InsertType` and `UpdateType` so `ref()` works in create/update input without `as any` casts.
- Fastify example with JSON Schema route validation.
- Migrations example with full programmatic lifecycle.
- Per-example `tsconfig.json` files and `typecheck:examples` script.

### Fixed
- README Quick Start showed incorrect single-step `db.defineStore('name', columns)` — corrected to two-step `db.defineTable()` + `db.defineStore()`.
- MySQL `create()` now generates UUIDs client-side for columns with `default: 'uuid:v4'` (needed because MySQL lacks `RETURNING`).

## [0.7.7] — 2026-02-25

### Added
- Support for `storium.config.ts` as config file name (with fallback to `drizzle.config.ts`).
- `STORIUM_CONFIG` and `DRIZZLE_CONFIG` environment variables for config file resolution.

### Breaking
- `ConnectConfig` renamed to `StoriumConfig`.

## [0.7.6] — 2026-02-24

### Breaking
- `ConnectConfig` renamed to `StoriumConfig` for clearer public API naming.

## [0.7.0 – 0.7.5]

### Added
- `defineTable()` — standalone schema definition (3 overloads: direct, curried dialect, auto-config).
- `defineStore()` — single overload bundling table + queries into a `StoreDefinition`.
- `db.defineStore()` — simple path creating a live store without `register()`.
- `db.register()` — multi-file path materializing `StoreDefinition` objects.
- `storium.fromDrizzle()` — create a `StoriumInstance` from an existing Drizzle instance with auto-detected dialect.
- `store.ref()` — look up a row's primary key by filter, with automatic Promise resolution in the prep pipeline.
- `withBelongsTo`, `withMembers`, `withCache` helpers.
- `defineSeed()` and `seed()` with auto-discovered stores from config globs.
- `collectSchemas()` for programmatic schema collection.
- JSON Schema generation via `toJsonSchema()` on all `RuntimeSchema` variants.

### Breaking (from 0.6.x)
- Removed all-in-one `defineStore(dialect, name, columns, queries)` overloads.
- Split into two-step: `defineTable()` (schema) → `defineStore()` (behavior).
- `.storium` metadata on tables is now non-enumerable (for drizzle-kit compatibility).
- Removed `StoreOptions`, `buildDefineStore`, `BoundDefineStore`.

## [0.1.x]

### Added
- Initial Drizzle + Zod integration.
- Multi-dialect support (PostgreSQL, MySQL, SQLite, memory).
- Prep pipeline (filter, transform, validate, required).
- Custom query pattern `(ctx) => async (...args) => result`.
- Built-in assertions (is_email, is_url, is_numeric, is_uuid, is_boolean, is_integer, not_empty).
- CLI wrapping drizzle-kit (`storium generate`, `migrate`, `push`, `status`, `seed`).

## [0.0.x]

Initial proof of concept built on Knex. Later rewritten for Drizzle ORM.
