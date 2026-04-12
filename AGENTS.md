# Storium — Agent Reference

Lightweight, database-agnostic storage abstraction built on Drizzle ORM and Zod. Users define native Drizzle tables, then `defineStore()` adds storium's validation, access control, CRUD, and schema generation on top.

## Project Structure

```
storium/
├── bin/
│   └── storium.ts              # CLI entry point (generate, migrate, push, seed, status)
├── src/
│   ├── index.ts                # Public API — named export: { storium, defineStore, ... }
│   ├── connect.ts              # Connection factory; dialect-specific Drizzle wiring + register()
│   └── core/
│       ├── types.ts            # All shared TypeScript types (Dialect, ColumnAnnotation, StoreConfig, etc.)
│       ├── defineStore.ts      # defineStore(drizzleTable, config?) — wraps Drizzle table with storium metadata; returns StoreDefinition
│       ├── introspect.ts       # Drizzle column introspection → Zod/JSON Schema mapping
│       ├── configLoader.ts     # loadConfig() — reads config from drizzle.config.ts
│       ├── createRepository.ts # CRUD builder + custom query context (ctx)
│       ├── prep.ts             # Validation/transform pipeline (filter → transform → validate → required)
│       ├── runtimeSchema.ts    # buildSchemaSet() → { createSchema, updateSchema, selectSchema, fullSchema } RuntimeSchema objects
│       ├── zodSchema.ts        # Zod schema generation from Drizzle column introspection + annotations
│       ├── jsonSchema.ts       # JSON Schema generation from Drizzle column introspection
│       ├── errors.ts           # ValidationError, ConfigError, SchemaError
│       └── test.ts             # createAssertionRegistry(), BUILTIN_ASSERTIONS, createTestFn()
│   ├── mixins/
│   │   ├── belongsTo.ts        # JOIN mixin for belongs-to relationships
│   │   ├── hasMany.ts          # One-to-many relationship mixin
│   │   ├── hasOne.ts           # One-to-one relationship mixin
│   │   ├── withMembers.ts      # Many-to-many membership mixin
│   │   ├── withCache.ts        # Caching wrapper
│   │   ├── withPagination.ts   # Pagination wrapper
│   │   └── withTransaction.ts  # createWithTransaction() helper
│   └── migrate/
│       ├── commands.ts         # generate(), migrate(), push(), status() — drizzle-kit CLI + drizzle-orm migrators
│       ├── schemaCollector.ts  # collectSchemas(globs) — imports schema files, extracts storium tables + raw Drizzle tables
│       └── seed.ts             # defineSeed(), seed(seedsDir, db)
├── examples/
│   ├── basic/                  # In-memory CRUD fundamentals
│   ├── custom-queries/         # Custom query patterns, raw Drizzle, overrides
│   ├── validation/             # Validation pipeline, assertions, transforms
│   ├── memory/                 # Multiple isolated in-memory databases
│   ├── from-drizzle/           # Bring your own Drizzle instance via fromDrizzle()
│   ├── postgres/               # PostgreSQL with pooling
│   ├── mysql/                  # MySQL with migrations
│   ├── sqlite/                 # SQLite with file DB
│   ├── fastify/                # REST API with JSON Schema validation
│   ├── migrations/             # Full migration workflow
│   └── relations/              # belongsTo, hasMany, withMembers
├── test/setup.ts               # Global vitest setup (minimal)
├── tsup.config.ts              # Build config
└── vitest.config.ts            # Test config — src/**/__tests__/**/*.test.ts
```

## Public API

```typescript
// Named exports
import { storium, defineStore, ValidationError, belongsTo, hasMany, hasOne, withPagination, ... } from 'storium'

storium.connect(config)          // StoriumConfig<D> → StoriumInstance<D> (dialect inferred from config literal)
storium.fromDrizzle(drizzleDb)   // Auto-detects dialect from Drizzle instance type via InferDialect<DB>
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

### StoriumInstance<D> (returned by connect() / fromDrizzle())
```typescript
db.drizzle           // Typed Drizzle instance — DrizzleDatabase<D>
db.zod               // Zod namespace (convenience accessor)
db.dialect           // Resolved dialect string (literal type D)
db.defineStore()     // Create a live store from a Drizzle table (simple path — no register step)
db.register()        // Materialize StoreDefinitions into live stores (multi-file pattern)
db.transaction()     // Async transaction wrapper
db.disconnect()      // Close connection / pool
```

### StoriumConfig (single config object)
```typescript
storium.connect({
  dialect: 'postgresql',
  url: process.env.DATABASE_URL,
  assertions: { is_slug: (v) => ... },
  pool: { min: 2, max: 10 },
  seeds: './seeds',
})
```

### fromDrizzle (auto-detects dialect)
```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
const myDrizzle = drizzle(myPool)
const db = storium.fromDrizzle(myDrizzle)
const db = storium.fromDrizzle(myDrizzle, { assertions: {} })
```

### defineStore (primary entry point)
```typescript
import { pgTable, uuid, varchar, text, timestamp } from 'drizzle-orm/pg-core'
import { defineStore } from 'storium'

// 1. Define a native Drizzle table
const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  password: text('password').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// 2. Wrap with storium metadata (annotations + queries)
const userStore = defineStore(usersTable, {
  columns: {
    email:     { required: true, validate: (v, test) => test(v, 'is_email') },
    password:  { hidden: true, transform: hashPassword },
    createdAt: { readonly: true },
    updatedAt: { readonly: true },
  },
  softDelete: true,  // requires deletedAt column on the Drizzle table
}).queries({
  findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
})

// 3. Minimal — no annotations needed
const postStore = defineStore(postsTable)
```

Returns a `StoreDefinition` (inert DTO). The DTO surfaces `.table`, `.name`,
and `.queryFns` so `schemaCollector` can detect store files for migrations.

### ColumnAnnotation (storium-specific metadata)
```typescript
type ColumnAnnotation = {
  readonly?: boolean    // Exclude from write operations
  hidden?: boolean      // Exclude from SELECT results
  required?: boolean    // Must be provided on create
  transform?: (value: any) => unknown | Promise<unknown>
  validate?: (value: any, test: TestFn) => void
}
```

### StoreConfig (defineStore second argument)
```typescript
type StoreConfig = {
  columns?: Record<string, ColumnAnnotation>
  softDelete?: boolean   // requires deletedAt column on Drizzle table
}
```

### db.defineStore() — simple path (live store, no register)
```typescript
const db = storium.connect(config)
const users = db.defineStore(usersTable, { columns: { email: { required: true } } })
  .queries({ search })
await users.findById('123')
```

### db.register() — multi-file pattern
```typescript
const db = storium.connect(config)
const { users, articles } = db.register({ users: userStore, articles: articleStore })
await users.findById('123')
```

### Custom query context (ctx)
```typescript
ctx.drizzle         // DrizzleDatabase<D> — typed when dialect is known
ctx.zod             // Zod namespace (convenience accessor)
ctx.table           // Drizzle table object with .storium metadata
ctx.selectColumns   // Pre-built column map for SELECT
ctx.primaryKey      // PK column name
ctx.schemas         // { createSchema, updateSchema, selectSchema, fullSchema }
ctx.prep()          // Validation/transform pipeline
// Default CRUD (always originals, even if overridden):
ctx.find/findOne/findById/findByIdIn/create/createMany/update/upsert/destroy/destroyAll/count/exists/ref
```

### Default store methods
Every store (from `db.defineStore()` or `db.register()`) exposes:
```typescript
store.name                           // Table name (string)
store.schemas                        // { createSchema, updateSchema, selectSchema, fullSchema }

// Read
store.find(filters, opts?)
store.findAll(opts?)
store.findOne(filters, opts?)
store.findById(id, opts?)
store.findByIdIn(ids, opts?)
store.count(filters?, opts?)
store.exists(filters, opts?)
store.ref(filter, opts?)

// Write
store.create(input, opts?)
store.createMany(inputs[], opts?)
store.update(id, input, opts?)
store.upsert(input, opts?)
store.destroy(id, opts?)
store.destroyAll(filters, opts?)
```

### Query opts
```typescript
{
  tx?: any                           // Transaction handle
  limit?: number
  offset?: number
  orderBy?: OrderBySpec | OrderBySpec[]
  includeHidden?: boolean
  force?: boolean                    // Bypass prep pipeline
  where?: (table) => SQL             // Drizzle WHERE clause
  conflictTarget?: string[]          // Upsert conflict columns
}
```

### where callback
```typescript
import { gt, like, and, isNull } from 'drizzle-orm'
await users.find({ status: 'active' }, { where: (t) => gt(t.age, 18) })
await users.findAll({ where: (t) => isNull(t.deletedAt) })
```

### softDelete
```typescript
// User defines deletedAt in their Drizzle table:
const users = pgTable('users', {
  // ...
  deletedAt: timestamp('deleted_at'),
})
const userStore = defineStore(users, { softDelete: true })

// Auto-filters deleted rows on reads, soft destroy, restore, forceDestroy, findWithDeleted
```

### belongsTo / hasMany / hasOne / withMembers
```typescript
import { belongsTo, hasMany, hasOne, withMembers } from 'storium'

const posts = defineStore(postsTable).queries({
  ...belongsTo(usersTable, 'authorId', { alias: 'author' }),
})

const authors = defineStore(authorsTable).queries({
  ...hasMany(postsTable, 'author_id', { alias: 'posts' }),
})
```

Note: Related tables passed to mixins must have `.storium` metadata (go through `defineStore` first).

### withPagination
```typescript
import { withPagination } from 'storium'
const paginatedUsers = withPagination(users, { pageSize: 10 })
await paginatedUsers.paginate({ status: 'active' }, { page: 2, pageSize: 25 })
```

### Table creation (dialect differences)
```typescript
// SQLite / memory
db.drizzle.run(sql`CREATE TABLE ...`)

// PostgreSQL / MySQL
await db.drizzle.execute(sql`CREATE TABLE ...`)
```

### Transactions (dialect differences)
- PostgreSQL/MySQL: uses Drizzle's native `db.transaction()` — fully async
- SQLite: manual `BEGIN/COMMIT/ROLLBACK` (better-sqlite3 rejects async async callbacks)
- Both: `db.transaction(async (tx) => { ... })` — same API

### Seeds
```typescript
import { defineSeed } from 'storium/migrate'
export default defineSeed(async ({ drizzle }) => {
  await drizzle.execute(sql`INSERT INTO ...`)
})
```

### Config file (drizzle.config.ts)
```typescript
import type { StoriumConfig } from 'storium'
export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./src/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
```

### Schema files (for migrations)
Export `StoreDefinition` (from `defineStore()`) or raw Drizzle tables.
`schemaCollector` detects both patterns for drizzle-kit compatibility.

### Recommended app structure (folder-per-store)
```
project/
├── drizzle.config.ts
├── database.ts                    # connect + register all stores
├── entities/
│   └── users/
│       ├── user.schema.ts         # pgTable('users', { ... })
│       ├── user.queries.ts        # Custom query functions
│       └── user.store.ts          # defineStore(usersTable, { columns: {...} }).queries({...})
├── collections/
│   └── user-roles/
│       ├── user-role.schema.ts    # pgTable('user_roles', { ... })
│       └── user-role.store.ts     # defineStore(table).queries({ ...withMembers(...) })
```

## Design philosophy
- **Pre-1.0: API design is the priority.** There are no users yet. Breaking changes are welcome if they produce a better API. Do not justify design decisions with "this matches current behavior" — evaluate on merit.
- **Drizzle is Drizzle.** Users define tables with native Drizzle syntax. Storium adds validation, access control, CRUD, and schemas on top — it doesn't replace Drizzle's column DSL.

## Example conventions
- Single `app.ts` — everything in one runnable file
- `package.json`: `"start": "tsx app.ts"`, `storium: "file:../.."`, `tsx` in devDeps
- In-memory examples: `dialect: 'memory'`, `db.drizzle.run(sql\`CREATE TABLE...\`)`
- Multi-file pattern: `Drizzle table → defineStore().queries() → storium.connect → db.register → use stores`
- Simple pattern: `storium.connect → db.defineStore(drizzleTable, config) → use store`
- Console output: `=== Section name ===` headers matching style of existing examples
- Always `await db.disconnect()` at end
