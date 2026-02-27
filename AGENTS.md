# Storium — Agent Reference

Lightweight, database-agnostic storage abstraction built on Drizzle ORM and Zod. One schema definition generates TypeScript types, Zod schemas, JSON Schema, and database migrations.

## Project Structure

```
storium/
├── bin/
│   └── storium.ts              # CLI entry point (generate, migrate, push, seed, status)
├── src/
│   ├── index.ts                # Public API — named export: { storium, defineTable, defineStore, ... }
│   ├── connect.ts              # Connection factory; dialect-specific Drizzle wiring + register()
│   └── core/
│       ├── types.ts            # All shared TypeScript types (Dialect, ColumnConfig, TableDef, etc.)
│       ├── defineTable.ts      # Schema DSL — defineTable(name, cols, opts); returns Drizzle table + .storium metadata
│       ├── defineStore.ts      # defineStore(tableDef, queries) — bundles table with custom queries
│       ├── configLoader.ts     # loadDialectFromConfig() — reads dialect from drizzle.config.ts
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
│       ├── commands.ts         # generate(), migrate(), push(), status() — drizzle-kit CLI + drizzle-orm migrators
│       ├── schemaCollector.ts  # collectSchemas(globs) — imports schema files, extracts storium tables
│       └── seed.ts             # defineSeed(), seed(seedsDir, db)
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
// Named exports
import { storium, defineTable, defineStore, ValidationError, withBelongsTo, ... } from 'storium'

storium.connect(config)          // StoriumConfig → StoriumInstance
storium.fromDrizzle(drizzleDb)   // Auto-detects dialect from Drizzle instance
storium.fromDrizzle(drizzleDb, { assertions }) // With storium options

// Sub-path (migration tooling — heavy deps, opt-in)
import { generate, migrate, push, status, seed, defineSeed, collectSchemas } from 'storium/migrate'
```

## Key Patterns

### Dialects
`'postgresql'` | `'mysql'` | `'sqlite'` | `'memory'` (memory = SQLite `:memory:`)

### Dependencies
- Peer: `drizzle-orm` (>=0.44), `drizzle-kit` (>=0.31), `zod` (>=4.0)
- Peer (optional): `pg`, `mysql2`, `better-sqlite3` (install one for your dialect)
- Runtime: `glob`

npm auto-installs non-optional peer deps when you `npm install storium`.

### StoriumInstance (returned by connect() / fromDrizzle())
```typescript
db.drizzle           // Raw Drizzle instance (escape hatch)
db.zod               // Zod namespace (convenience accessor matching db.drizzle)
db.dialect           // Resolved dialect string
db.defineTable()     // Dialect-bound schema definition (no CRUD)
db.defineStore()     // Create a live store directly (simple path — no register step)
db.register()        // Materialize StoreDefinitions into live stores (multi-file pattern)
db.transaction()     // Async transaction wrapper
db.disconnect()      // Close connection / pool
```

### StoriumConfig (single config object)
```typescript
// Accepts both storium inline and drizzle-kit config shapes.
// Storium-specific keys (assertions, pool, seeds) are ignored by drizzle-kit.
storium.connect({
  dialect: 'postgresql',
  url: process.env.DATABASE_URL,     // or dbCredentials: { url: '...' }
  assertions: { is_slug: (v) => ... },
  pool: { min: 2, max: 10 },
  seeds: './seeds',
})

// Drizzle config + storium extras
import config from './drizzle.config'
storium.connect({ ...config, assertions: { ... } })
```

### fromDrizzle (auto-detects dialect)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
const myDrizzle = drizzle(myPool)
const db = storium.fromDrizzle(myDrizzle)                     // dialect auto-detected
const db = storium.fromDrizzle(myDrizzle, { assertions: {} }) // with options
```

### defineTable (3 overloads)
```typescript
// Overload 1: Direct call — auto-loads dialect from drizzle.config.ts
defineTable('users', columns, options) → TableDef

// Overload 2: Curried with explicit dialect — returns a bound function
defineTable('postgresql')('users', columns, options) → TableDef

// Overload 3: No-arg — auto-loads dialect, returns bound function for reuse
const dt = defineTable()
dt('users', columns, options) → TableDef
```

### defineStore (single signature)
```typescript
// Bundle a table (from defineTable) with custom queries into a StoreDefinition.
// Two distinct steps: defineTable defines schema, defineStore adds behavior.
const userStore = defineStore(usersTable, { search, findByEmail })
```
Returns a `StoreDefinition` (inert DTO). The DTO surfaces `.table` and `.name`
so `schemaCollector` can detect store files for migrations.

### db.defineStore() — simple path (live store, no register)
```typescript
// Create a live store from a table definition — no register step needed.
const db = storium.connect(config)
const usersTable = db.defineTable('users', columns, options)
const users = db.defineStore(usersTable, { search })
await users.findById('123')
```

### db.register() — multi-file pattern
```typescript
// Single composition point: wires StoreDefinitions to a live db connection.
// Best for large apps with 100+ tables organized in separate files.
const db = storium.connect(config)
const { users, articles } = db.register({ users: userStore, articles: articleStore })
await users.findById('123')
```

### Custom query context (ctx)
```typescript
ctx.drizzle         // Raw Drizzle instance
ctx.zod             // Zod namespace (convenience accessor)
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
`type`, `primaryKey`, `notNull`, `maxLength`, `default` (`'now'`|`'random_uuid'`|literal), `mutable`, `writeOnly`, `required`, `transform`, `validate`, `custom`, `raw`

### Config file (drizzle.config.ts)
```typescript
// A single config shared by drizzle-kit and storium.
// drizzle-kit keys: dialect, dbCredentials, schema, out
// storium extras: assertions, pool, seeds (drizzle-kit ignores these)
import type { StoriumConfig } from 'storium'

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./src/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
```
`generate()` and `push()` shell out to drizzle-kit CLI. `migrate(config, db)` uses drizzle-orm's built-in migrators.
`seed(seedsDir, db)` takes the seeds directory as a string.

### Schema files (for migrations)
`defineTable` returns a plain Drizzle table with a non-enumerable `.storium` property.
drizzle-kit detects these as real Drizzle tables — no re-export workaround needed.
Use `defineTable('users', {...})` directly (auto-loads dialect from `drizzle.config.ts`)
or `defineTable('postgresql')('users', {...})` for explicit dialect.
`db.defineTable` can't be used because drizzle-kit imports schema files at module level
before any db connection exists.

Storium metadata is accessible via `table.storium.columns`, `table.storium.schemas`, etc.
The `StoriumMeta` type is exported for advanced users writing custom query helpers.

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
- Both: `db.transaction(async (tx) => { ... })` — same API

### Seeds
```typescript
// seeds/001_posts.ts
import { defineSeed } from 'storium/migrate'
export default defineSeed(async ({ drizzle }) => {
  await drizzle.execute(sql`INSERT INTO ...`)
})
// Run: await seed('./seeds', db)
```

### Recommended app structure (folder-per-store)
```
project/
├── drizzle.config.ts              # Single config for drizzle-kit + storium
├── database.ts                    # Plumbing: connect + register all stores
├── entities/
│   └── users/
│       ├── user.schema.ts         # defineTable('users', columns, options)
│       ├── user.queries.ts        # Custom query functions
│       └── user.store.ts          # defineStore(usersTable, { ...queries })
```

## Example conventions
- Single `app.ts` — everything in one runnable file
- `package.json`: `"start": "tsx app.ts"`, `storium: "file:../.."`, `tsx` in devDeps
- In-memory examples: `dialect: 'memory'`, `db.drizzle.run(sql\`CREATE TABLE...\`)`
- Multi-file pattern: `defineTable → defineStore → storium.connect → db.register → use stores`
- Simple pattern: `storium.connect → db.defineTable → db.defineStore → use stores`
- Console output: `=== Section name ===` headers matching style of existing examples
- Always `await db.disconnect()` at end
