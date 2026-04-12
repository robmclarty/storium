# Examples

Each example is a self-contained project you can run with `npm start` from its
directory. Install dependencies first with `npm install`.

## [basic](examples/basic)

The simplest path to a working store. Covers native Drizzle table definition,
CRUD operations, validation with transforms and assertions, transactions, and
runtime schemas using an in-memory database.

## [custom-queries](examples/custom-queries)

Extending stores with domain-specific operations via custom queries. Shows
composing with built-in CRUD, overriding `create` for auto-slug generation, and
using the raw Drizzle escape hatch for search and atomic operations.

## [validation](examples/validation)

Walks through storium's four-stage prep pipeline (filter, transform, validate,
required). Demonstrates type checking, custom assertions, error collection,
readonly field handling, the `skipPrep` bypass, and runtime schema generation.

## [memory](examples/memory)

Ephemeral in-memory SQLite databases for quick prototyping and testing. Shows
how multiple independent databases can coexist with fully isolated state.

## [from-drizzle](examples/from-drizzle)

Wrapping an existing Drizzle instance with `storium.fromDrizzle()`. Defines
stores with Drizzle-native tables and storium metadata while maintaining both
storium CRUD and raw Drizzle access side by side.

## [relations](examples/relations)

Relationship patterns including `belongsTo` (LEFT JOIN), many-to-many via join
tables with `withMembers`, composite primary keys, foreign key resolution via
`ref()`, and the migration lifecycle.

## [fastify](examples/fastify)

A REST API built with Fastify that uses storium's auto-generated JSON Schema for
request validation. Covers dependency injection, full CRUD endpoints, validation
error handling, batch operations via transactions, and self-testing.

## [migrations](examples/migrations)

The full migration lifecycle using the programmatic API (`generate`, `status`,
`migrate`, `seed`). Shows equivalents to CLI commands and verifies seeded data.

## [postgresql](examples/postgresql)

Multi-file organization with a real PostgreSQL backend. Demonstrates
PostgreSQL-specific features like JSONB columns, text arrays, custom queries,
transactions, hidden columns, and runtime schemas.

## [mysql](examples/mysql)

Multi-file organization with a real MySQL backend. Covers migrations, seeds,
full CRUD, hidden columns for authentication, custom queries, MySQL-specific
JSON handling, transactions, and validation.

## [sqlite](examples/sqlite)

File-based SQLite workflow with multi-file organization, migrations, seeds, full
CRUD, hidden columns, custom queries with SQLite-specific JSON functions,
transactions, and validation schemas.
