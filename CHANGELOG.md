# Changelog

All notable changes to Storium are documented here.

This project uses [Semantic Versioning](https://semver.org/). Pre-1.0 releases may include breaking changes in minor versions.

## 0.14.17

- Fix strict equality checks to satisfy eqeqeq lint rule
- Extract helpers to reduce code duplication and cognitive complexity
- Remove dead code: unused barrel, re-exports, and unexported types
- Configure fallow for integration tests, testcontainers, and duplication exceptions
- Reorder Mermaid diagram boxes to uncross arrows

## 0.14.16

- Add README.md to all 11 examples with install instructions, usage, and project structure descriptions

## 0.14.15

- Add Mermaid diagrams to README and docs for visual technical documentation: architecture overview, validation pipeline, relationship patterns, ctx resolution, migration workflow, seed discovery, and single-source-of-truth derivation

## 0.14.14

- Rewrite README and docs to reflect current `defineStore` + native Drizzle API (removed all `defineTable` DSL references)
- Remove obsolete doc files: `column-naming.md`, `column-reference.md`, `raw-columns.md`
- Rewrite `api-reference.md` to match current exports
- Update `relationships.md`, `validation.md`, `why-storium.md`, `custom-queries.md`, `migrations.md` for current API
- Fix missing `await` on `.rejects.toThrow()` in belongsTo/hasMany tests (Vitest 3 compat)
- Improve package.json metadata: add keywords, switch repo URL to HTTPS

## 0.14.13

- Harden connection lifecycle: clean up pool on init errors, allow disconnect retry on failure, preserve original error when SQLite ROLLBACK fails
- Add `child.on('error')` handler to spawned migration processes to prevent hanging promises
- Use `Promise.allSettled` in `resolveInput` for field-level error accumulation (matches transform stage pattern)
- Wrap relationship query errors (`hasMany`, `hasOne`, `belongsTo`) as `StoreError` for consistency with CRUD methods
- Add SIGTERM/SIGINT signal handlers to CLI `migrate` and `seed` commands for graceful shutdown
- Fix lint: merge duplicate drizzle-orm import, move `enc()` to module scope

## 0.14.12

- Replace `inferDialect()` constructor name matching with Drizzle's stable `is()` utility (entityKind symbol) — survives bundlers/minifiers
- Fix MySQL `create`, `createMany`, and `upsert`: resolve `$defaultFn` for PK columns before INSERT so the follow-up SELECT finds the row
- Fix MySQL `destroyAll` and `softDestroyAll`: read `affectedRows` from MySQL's `[ResultSetHeader, FieldPacket[]]` tuple result
- Fix `withMembers.removeMember` MySQL result parsing (same tuple issue)
- Fix integration test config: add `hookTimeout` for container startup, fix `storium/migrate` alias

## 0.14.11

- Type ctx CRUD methods with PrepOptions instead of QueryOptions so custom query factories can pass escape hatches (includeHidden, skipPrep) without casting
- Harden typecheck:examples to exit non-zero on errors; fix 8 type errors across 5 examples
- Widen defineStore overload to Table<any> for Drizzle column variance
- Type StoreDefinition.table as TTable & { storium: StoriumMeta }

## 0.14.10

- Update AGENTS.md for v0.14.9 API changes (StoreConfig.conflictTarget, destroy return type, generic QueryOptions, withMembers tx support, mixin soft-delete awareness)
- Add mixin soft-delete filtering tests for hasMany and belongsTo
- Add withMembers tests for removeMember throw on missing row and tx option
- Add column introspection tests covering string, integer, real, boolean, timestamp, JSON, and blob mapping through Zod and JSON Schema pipelines
- Add Zod ↔ JSON Schema required-field alignment verification tests

## 0.14.9

- Align Zod and JSON Schema required-field logic: both now enforce `notNull && !hasDefault` columns as required on insert
- Align JSON Schema `json` column type to `oneOf: [object, array]`, matching the Zod union
- Remove transforms from Zod schemas (transforms are handled by the prep pipeline only, fixing async transform corruption)
- Prep pipeline `checkRequired` now enforces DB-level `notNull` columns, not just annotation `required`
- Wrap DB constraint violations (unique, FK, NOT NULL) in `StoreError` with structured messages
- Wrap driver `require()` errors in `ConfigError` with install instructions
- Catch transform errors in prep and wrap in `ValidationError`
- Validate `orderBy` column names and composite PK array lengths
- Add soft-delete awareness to `hasMany`, `hasOne`, and `belongsTo` mixins
- Add `opts.tx` transaction support to all `withMembers` methods
- `addMember` throws on MySQL post-SELECT miss; `removeMember` throws when no row found
- Guard `withCache` `delPattern` failures after successful writes (optional `onError` callback)
- Throw `StoreError` for unknown column names in mixin `select` arrays
- **Breaking:** `QueryOptions<TTable>` is now generic (typed `where` callback with column autocomplete)
- **Breaking:** Remove `Repository` type alias (use `Store` everywhere)
- **Breaking:** `destroy()` now returns the deleted row (was `void`)
- Remove internal types from public exports (`TableDef`, `TableAccess`, `PrepOptions`, `RepositoryContext`, `DefaultCRUD`, `DrizzleDatabase`, `InferDialect`)
- `hasMeta()` returns type predicate (`value is TableDef`) for TypeScript narrowing
- Add `conflictTarget` to `StoreConfig` for default upsert conflict columns
- Remove Bun re-exec block from CLI

## 0.14.8

- Add multi-dialect integration tests for soft-delete, upsert, relationships, withMembers, and pagination
- Add concurrency smoke tests (parallel creates, concurrent reads/writes, transaction isolation)
- Add migration config loader unit tests and migrate() integration tests
- Add connection lifecycle tests and pool configuration coverage
- Add generate/push command smoke tests
- Extend crud tests with createMany composite PK, complex WHERE clauses, and bulk findByIdIn
- Extend transaction tests with UPDATE+SELECT within transaction scope
- Add test table definitions for soft-delete users, profiles, and team members (all 3 dialects)
- Document MySQL UPDATE+SELECT race condition on `updateAndReturn` with `{ tx }` recommendation
- Document MySQL pool asymmetry (`pool.min` not supported by mysql2)
- Add `@experimental` JSDoc tag to `withCache` export
- Fix composite PK tests passing plain strings to UUID columns on PostgreSQL

## 0.14.7

- Add `tsconfig.check.json` to include test files in typecheck, catching errors the build tsconfig missed
- Fix unused imports across test files (`integer`, `SeedModule`, `beforeEach`, `getTableColumns`, `UserRow`, `UserInsert`)
- Fix mixin test type errors by casting tables to `TableDef` after `defineStore()` attaches `.storium` metadata
- Fix `transform` parameter types in test annotations to match `(value: unknown) => unknown` signature
- Fix `Object is possibly undefined` errors in assertion tests with non-null assertions
- Fix `withCache` mock function signatures to accept expected arguments

## 0.14.6

- Add `TTable` generic to `Store`, `DefaultCRUD`, `Repository`, `RepositoryContext`, `StoreDefinition`, and `StoriumInstance.defineStore` — CRUD methods now return typed rows (`InferSelectModel<TTable>`) instead of `any` when a specific table type is provided
- Add `InferRow<TTable>` and `InferInput<TTable>` utility types with backward-compatible `any` fallback
- Add optional `dialect` parameter to `fromDrizzle()` options as an escape hatch when constructor-name inference fails (e.g., bundlers/minifiers)
- Add `fromDrizzle` overloads so the return type honors an explicit dialect override
- Add SQLite transaction commit/rollback tests and improve `createWithTransaction` documentation
- Add type-level verification tests for `Store<TTable>` generics

## 0.14.5

- Add `countWithDeleted()` and `paginateWithDeleted()` for soft-delete stores — `withPagination` now composes with soft-delete out of the box
- Reduce `any` usage in mixins: type select column maps as `Record<string, Column>`, `where` returns as `SQL | undefined`, orderBy specs as `OrderBySpec`, cache wrapper args as `unknown[]`
- Replace `withPagination`'s local `PaginateOpts` type with `QueryOptions` extension, removing `includeHidden` from the public pagination interface
- Document structural `any` usages with `@remarks` JSDoc (QueriesConfig, DefaultCRUD, mixins, repository internals)
- Add `docs/type-safety.md` explaining what is typed, what is intentionally `any`, and the future `Store<T>` generic path
- Add multi-column `orderBy` array test

## 0.14.4

- **Breaking:** Rename `force` option to `skipPrep` on PrepOptions (follows `validateRequired`/`onlyWritable`/`includeHidden` naming convention)
- **Breaking:** Change `withMembers` default `memberKey` from `'user_id'` to `'member_id'`
- **Breaking:** `destroy()` and soft-delete `destroy()` now throw `StoreError` when no row matches (consistent with `update()`)
- Split `PrepOptions` into public `QueryOptions` (for Store methods) and internal `PrepOptions` (for custom query `ctx` methods) — `skipPrep` and `includeHidden` are no longer accessible from application code at the type level
- Fix MySQL `createMany()` for composite-PK tables (was silently returning empty results)
- Fix `detectPrimaryKey` to detect table-level composite PKs via `primaryKey()` constraint; remove unsafe fallback to `'id'` column
- Fix `withMembers` RETURNING support for SQLite/memory dialects (was PostgreSQL-only)
- Fix `withCache` write invalidation — add `createMany`, `upsert`, `restore`, `forceDestroy`, `forceDestroyAll` to invalidation list
- Fix JSON column Zod schema to accept arrays (aligns with prep pipeline behavior)
- Fix `buildConnectionUrl` to percent-encode credentials with special characters
- Remove `upsert()` magic `updatedAt` auto-injection (timestamps are user's responsibility)
- Add filter key validation in CRUD methods — unknown keys throw `StoreError` with valid column list
- Warn when `db.defineStore()` receives config for a table with existing storium metadata
- Extract `supportsReturning(dialect)` helper, eliminating scattered dialect branching
- Move `assertions.ts` to `src/` root (fixes schema→store layer boundary violation)
- Deduplicate `Repository` type as alias for `Store`
- Remove `attachStoriumMeta` from store barrel export (internal only)
- Reduce `any` usage: type WHERE conditions as `SQL[]`, column maps as `Record<string, Column>`, callbacks as `(value: unknown)`
- Add testcontainers infrastructure and 36 multi-dialect integration tests (CRUD, transactions, error recovery, connection lifecycle)
- Reorganize `src/core/` into domain-grouped structure
- Update AGENTS.md: remove non-existent `withTransaction.ts` reference

## 0.14.3

- Remove orphaned `uuidv7` module (Drizzle's `$defaultFn` handles UUID generation)
- Rename `test.ts` → `assertions.ts` to avoid naming collision with test frameworks
- Merge `runtime.schema.ts` and `zod.schema.ts` into single `schema.ts` module
- Dissolve `introspect.ts` — inlined into `schema.ts`, `json.schema.ts`, and `prep.ts`
- Fold `relatedQuery.ts` into `hasMany.ts` (shared helpers exported for `hasOne`)
- Move `configLoader.ts` from `src/core/` to `src/migrate/` (only used by CLI/migrations)
- Rename camelCase files to dot notation convention

## 0.14.2

- Rename `.schema.ts` files to `.table.ts` across examples and test fixtures — better reflects that these files hold Drizzle table definitions and drive migrations
- Update all imports, config globs, and test expectations for the new `.table.ts` convention
- Update documentation (README, AGENTS.md, migrations guide) for `.table.ts` file naming

## 0.14.1 - 11 Apr 2026

- Fix TS2339 error on `.storium` access in from-drizzle example (cast to `any` for runtime-attached property)
- Remove stale `@ts-expect-error` directive in validation example

## 0.14.0 - 11 Apr 2026

- **BREAKING:** Remove `defineTable` DSL — users define tables with native Drizzle syntax (`pgTable`, `sqliteTable`, `mysqlTable`)
- **BREAKING:** `defineStore(drizzleTable, config?)` is now the sole entry point for storium metadata
- **BREAKING:** Remove `db.defineTable()` from StoriumInstance; `db.defineStore()` accepts raw Drizzle tables
- **BREAKING:** `StoriumMeta` uses `.annotations` instead of `.columns`; remove `DslType`, `DslColumnConfig`, `ColumnsConfig`, and related types
- **BREAKING:** Timestamps and indexes are no longer auto-injected — define them in Drizzle table definitions
- **BREAKING:** Soft delete requires user-defined `deletedAt` column in Drizzle table
- Add `ColumnAnnotation` and `StoreConfig` types for storium-specific column metadata
- Add `src/core/introspect.ts` — maps Drizzle column metadata (`.dataType`, `.columnType`, `.length`) to Zod and JSON Schema types
- Remove `dialect.ts`, `indexes.ts`, `defineTable.ts`, and `loadDialectFromConfig()`
- `schemaCollector` now detects raw Drizzle table exports alongside StoreDefinitions
- Add `coverage` script to package.json
- Rewrite all 11 examples and 21 test files for the new API

## 0.13.5 - 11 Apr 2026

- Add `defineTable(drizzleTable)` overload for wrapping existing Drizzle tables with Storium metadata
- Rewrite from-drizzle example to use Drizzle-native table definitions with indexes and constraints

## 0.13.4 - 11 Apr 2026

- Fix relations example crash: import `belongsTo` instead of non-existent `withBelongsTo`
- Add email validation to sqlite, postgresql, and mysql example user schemas so the Validation section produces output

## 0.13.3 - 11 Apr 2026

- Fix all fallow dead code, duplication, and complexity issues (41 → 0)
- Remove 14 dead re-exports from core barrel, unexport internal-only types
- Extract shared helpers to deduplicate mixins and createRepository
- Refactor `deriveAccess` and `buildConnectionUrl` to reduce cyclomatic complexity
- Switch `lint:fallow` from `--fail-on-regression` to `--fail-on-issues`

## 0.13.2 - 11 Apr 2026

- Add fallow for dead code, duplication, and complexity analysis with regression baseline
- Add `lint:fallow` script and include it in the main `lint` pipeline

## 0.13.1 - 11 Apr 2026

- Update documentation for 0.13.0 features (README, API reference, relationships)
- Fix `.gitignore` to only ignore `.claude/settings.local.json` instead of entire `.claude/` directory

## 0.13.0 - 11 Apr 2026

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

## 0.12.0 - 11 Apr 2026

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

## 0.11.0 - 28 Feb 2026

### Breaking
- **`default: 'random_uuid'` renamed to `default: 'uuid:v4'`.** The colon convention distinguishes dynamic generators from literal default values. Update all column definitions accordingly.

### Added
- **UUIDv7 support** — `default: 'uuid:v7'` generates RFC 9562 UUIDv7 values with temporal sortability and better B-tree index performance (append-mostly inserts, fewer page splits). Includes a monotonic counter (§6.2) for strict ordering within the same millisecond.
- PostgreSQL example updated to use `uuid:v7` for primary keys.

## 0.10.0 - 28 Feb 2026

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

## 0.9.2 - 28 Feb 2026

### Fixed
- `withMembers()` methods now appear on `Store` type (removed `QueriesConfig` return annotation that erased literal keys)
- `withBelongsTo()` `findWith{Alias}` now appears on `Store` type via generic `A extends string` + template literal return type

### Changed
- Renamed `src/helpers/` → `src/mixins/` (better describes composable query sets that get mixed into stores)
- Expanded `Ctx` JSDoc with inline vs separate-file guidance

## 0.9.1 - 28 Feb 2026

### Changed
- `DrizzleDatabase<D>` falls back to `any` when `D` is the full `Dialect` union, so `StoriumInstance` and `Ctx` work without specifying a dialect param.
- Removed `ctx: Ctx` type annotations from all examples — plain `(ctx) =>` with inference is the recommended pattern. `Ctx` is still exported for users who want explicit typing.

### Added
- `from-drizzle` example: demonstrates `storium.fromDrizzle()` with `@libsql/client` — a different SQLite driver than the `better-sqlite3` Storium uses internally — proving driver-agnostic behavior.

## 0.9.0 - 28 Feb 2026

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

## 0.8.3 - 28 Feb 2026

### Added
- New documentation: `docs/column-naming.md` — explains camelCase/snake_case conventions, `dbName` override, timestamps, and raw columns.

## 0.8.2 - 28 Feb 2026

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

## 0.8.1 - 28 Feb 2026

### Added
- Composite primary key support.
- `dialect.ts` unit tests — all 13 DSL types across all 4 dialects (93 tests).

## 0.8.0 - 28 Feb 2026

### Added
- `toJsonSchema()` options: `properties`, `required`, `title`, `description`, `$id`.

## 0.7.10 - 27 Feb 2026

### Added
- Unit tests for all core modules, helpers, migrate modules, and `connect.ts` (168 tests across 17 files).
- New documentation: `custom-queries.md`, `validation.md`, `migrations.md`, `relationships.md`, `column-reference.md`.

## 0.7.9 - 27 Feb 2026

### Breaking
- **`SchemaSet` keys renamed** for ergonomic destructuring:
  - `insert` → `createSchema`
  - `update` → `updateSchema`
  - `select` → `selectSchema`
  - `full` → `fullSchema`

  Before: `users.schemas.insert.validate(data)`
  After: `const { createSchema } = users.schemas; createSchema.validate(data)`

- `examples/postgres` renamed to `examples/postgresql` to match the dialect name.

## 0.7.8 - 27 Feb 2026

### Added
- Relations example (`examples/relations/`) demonstrating `withBelongsTo`, `withMembers`, and custom JOINs with full generate/migrate workflow.
- `Promisable<T>` type on `InsertType` and `UpdateType` so `ref()` works in create/update input without `as any` casts.
- Fastify example with JSON Schema route validation.
- Migrations example with full programmatic lifecycle.
- Per-example `tsconfig.json` files and `typecheck:examples` script.

### Fixed
- README Quick Start showed incorrect single-step `db.defineStore('name', columns)` — corrected to two-step `db.defineTable()` + `db.defineStore()`.
- MySQL `create()` now generates UUIDs client-side for columns with `default: 'uuid:v4'` (needed because MySQL lacks `RETURNING`).

## 0.7.7 - 25 Feb 2026

### Added
- Support for `storium.config.ts` as config file name (with fallback to `drizzle.config.ts`).
- `STORIUM_CONFIG` and `DRIZZLE_CONFIG` environment variables for config file resolution.

### Breaking
- `ConnectConfig` renamed to `StoriumConfig`.

## 0.7.6 - 24 Feb 2026

### Breaking
- `ConnectConfig` renamed to `StoriumConfig` for clearer public API naming.

## 0.7.0 – 0.7.5

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

## 0.1.x

### Added
- Initial Drizzle + Zod integration.
- Multi-dialect support (PostgreSQL, MySQL, SQLite, memory).
- Prep pipeline (filter, transform, validate, required).
- Custom query pattern `(ctx) => async (...args) => result`.
- Built-in assertions (is_email, is_url, is_numeric, is_uuid, is_boolean, is_integer, not_empty).
- CLI wrapping drizzle-kit (`storium generate`, `migrate`, `push`, `status`, `seed`).

## 0.0.x

Initial proof of concept built on Knex. Later rewritten for Drizzle ORM.
