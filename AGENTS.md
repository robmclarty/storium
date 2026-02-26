# Storium — Agent Reference

Lightweight, database-agnostic storage abstraction built on Drizzle ORM and Zod. One schema definition generates TypeScript types, Zod schemas, JSON Schema, and database migrations.

## Project Structure

```
storium/
├── bin/
│   └── storium.ts              # CLI entry point (generate, migrate, push, seed, status)
├── src/
│   ├── index.ts                # Public API — default export: { connect, fromDrizzle }
│   ├── connect.ts              # Connection factory; dialect-specific Drizzle wiring
│   ├── config.ts               # defineConfig() for storium.config.ts files
│   └── core/
│       ├── types.ts            # All shared TypeScript types (Dialect, ColumnConfig, TableDef, etc.)
│       ├── defineTable.ts      # Schema DSL — createDefineTable(dialect) → defineTable(name, cols, opts)
│       ├── defineStore.ts      # createDefineStore(dialect, db) → defineStore(name, cols, opts)
│       ├── createRepository.ts # CRUD builder + custom query context (ctx)
│       ├── dialect.ts          # DSL type → Drizzle column builder mappings per dialect
│       ├── prep.ts             # Validation/transform pipeline (filter → transform → validate → required)
│       ├── runtimeSchema.ts    # buildSchemaSet() → { insert, update } RuntimeSchema objects
│       ├── zodSchema.ts        # Zod schema generation from column configs
│       ├── jsonSchema.ts       # JSON Schema generation
│       ├── indexes.ts          # Index DSL → Drizzle index builders
│       ├── errors.ts           # ValidationError, ConfigError, SchemaError
│       └── test.ts             # createAssertionRegistry(), BUILTIN_ASSERTIONS, createTestFn()
│   ├── helpers/
│   │   ├── withBelongsTo.ts    # JOIN helper for belongs-to relationships
│   │   ├── withMembers.ts      # Many-to-many membership helper
│   │   ├── withCache.ts        # Caching wrapper
│   │   └── withTransaction.ts  # createWithTransaction() helper
│   └── migrate/
│       ├── commands.ts         # generate(), migrate(), push(), status() — wrap drizzle-kit
│       ├── schemaCollector.ts  # collectSchemas(globs) — imports schema files, extracts .table/.name
│       └── seed.ts             # defineSeed(), runSeeds(config, db)
├── examples/
│   ├── basic/                  # Complete: in-memory CRUD fundamentals
│   ├── custom-queries/         # Complete: custom query patterns, raw Drizzle, overrides
│   ├── validation/             # Complete: validation pipeline, assertions, transforms
│   ├── memory/                 # Complete: multiple isolated in-memory databases
│   ├── postgres/               # Stub — plan at ~/.claude/plans/temporal-finding-frog.md
│   ├── mysql/                  # Stub
│   ├── sqlite/                 # Stub
│   ├── fastify/                # Stub
│   ├── migrations/             # Stub
│   └── relations/              # Stub
├── test/setup.ts               # Global vitest setup (minimal)
├── tsup.config.ts              # Build config
└── vitest.config.ts            # Test config — src/**/__tests__/**/*.test.ts
```

## Public API

```typescript
// Default export
import storium from 'storium'
storium.connect(config)       // ConnectConfig | StoriumConfig → StoriumInstance
storium.fromDrizzle(db, config) // Wrap existing Drizzle instance

// Named exports
import { createDefineTable, createDefineStore, ValidationError, withBelongsTo, ... } from 'storium'

// Sub-paths
import { defineConfig } from 'storium/config'
import { generate, migrate, push, status, runSeeds, defineSeed, collectSchemas } from 'storium/migrate'
```

## Key Patterns

### Dialects
`'postgresql'` | `'mysql'` | `'sqlite'` | `'memory'` (memory = SQLite `:memory:`)

### StoriumInstance (returned by connect())
```typescript
db.drizzle          // Raw Drizzle instance (escape hatch)
db.dialect          // Resolved dialect string
db.defineTable()    // Dialect-bound schema definition (no CRUD)
db.defineStore()    // Dialect-bound schema + CRUD + custom queries
db.withTransaction() // Async transaction wrapper
db.disconnect()     // Close connection / pool
```

### defineStore overloads
```typescript
// Overload 1: name + columns (most common)
db.defineStore('posts', { ...columns }, { queries, indexes, timestamps })

// Overload 2: pre-built TableDef + queries (for schema/query separation)
db.defineStore(postsTable, { queries })
```

### Custom query context (ctx)
```typescript
ctx.db              // Raw Drizzle instance
ctx.table           // Drizzle table object
ctx.selectColumns   // Pre-built column map for SELECT
ctx.primaryKey      // PK column name
ctx.schemas         // { insert, update } RuntimeSchema
ctx.prep()          // Validation/transform pipeline
ctx.find/findOne/findById/findByIdIn/create/update/destroy/destroyAll  // originals
```

### Column modes
```typescript
// DSL (most common)
email: { type: 'varchar', maxLength: 255, mutable: true, required: true }

// DSL + custom (Drizzle tweak)
email: { type: 'varchar', maxLength: 255, custom: col => col.unique() }

// Raw (full Drizzle control — for types not in DSL, e.g. text[])
tags: { raw: () => text('tags').array().default([]), mutable: true }
```

### DSL column types
`uuid` | `varchar` | `text` | `integer` | `bigint` | `serial` | `real` | `numeric` | `boolean` | `timestamp` | `date` | `jsonb`

### Column metadata
`type`, `primaryKey`, `notNull`, `maxLength`, `default` (`'now'`|`'random_uuid'`|literal), `mutable`, `hidden`, `required`, `transform`, `validate`, `custom`, `raw`

### StoriumConfig (storium.config.ts)
```typescript
defineConfig({
  dialect: 'postgresql',
  connection: { url: process.env.DATABASE_URL },
  schema: ['./src/**/*.schema.ts'],
  migrations: { directory: './migrations' },
  seeds: { directory: './seeds' },
})
```
`connect()`, `generate()`, `migrate()`, `runSeeds()` all accept `StoriumConfig` — same object the CLI uses.

### Schema files (for migrations)
Schema files must export a `TableDef` (has `.table` and `.name`) detectable by `collectSchemas()`. Use `createDefineTable('postgresql')` directly — `db.defineTable` can't be used because drizzle-kit imports schema files at module level before any db connection exists.

### Table creation (dialect differences)
```typescript
// SQLite / memory
db.drizzle.run(sql`CREATE TABLE ...`)

// PostgreSQL / MySQL
await db.drizzle.execute(sql`CREATE TABLE ...`)
// .execute() returns { rows: [] } — use .rows to access results
```

### Transactions (dialect differences)
- PostgreSQL/MySQL: uses Drizzle's native `db.transaction()` — fully async
- SQLite: manual `BEGIN/COMMIT/ROLLBACK` (better-sqlite3 rejects async callbacks)
- Both: `db.withTransaction(async (tx) => { ... })` — same API

### Seeds
```typescript
// seeds/001_posts.ts
import { defineSeed } from 'storium/migrate'
export default defineSeed(async ({ db, config }) => {
  await db.execute(sql`INSERT INTO ...`)
})
// Run: await runSeeds(config, db.drizzle)
```

## Example conventions
- Single `app.ts` — everything in one runnable file
- `package.json`: `"start": "tsx app.ts"`, `storium: "file:../.."`, `tsx` in devDeps
- In-memory examples: `dialect: 'memory'`, `db.drizzle.run(sql\`CREATE TABLE...\`)`
- Console output: `=== Section name ===` headers matching style of existing examples
- Always `await db.disconnect()` at end

## Dependencies
- Runtime: `drizzle-orm`, `zod`, `glob`
- Peer (optional): `pg` (PostgreSQL), `mysql2` (MySQL), `better-sqlite3` (SQLite)
- Dev: `tsx`, `vitest`, `tsup`, `oxlint`
