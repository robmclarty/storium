# Changelog

All notable changes to Storium are documented here.

This project uses [Semantic Versioning](https://semver.org/). Pre-1.0 releases may include breaking changes in minor versions.

## [Unreleased]

### Added
- `dialect.ts` unit tests — all 13 DSL types across all 4 dialects (93 tests).

### Changed
- Nothing yet.

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
- MySQL `create()` now generates UUIDs client-side for columns with `default: 'random_uuid'` (needed because MySQL lacks `RETURNING`).

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
