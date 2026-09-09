# Storium — Agent Reference

Lightweight, database-agnostic storage abstraction built on Drizzle ORM and Zod. Users define native Drizzle tables, then `defineStore()` adds storium's validation, access control, CRUD, and schema generation on top.

## Project Structure

```text
storium/
├── bin/
│   └── storium.ts              # CLI entry point (generate, migrate, push, seed, status)
├── src/
│   ├── index.ts                # Public API barrel — named exports: { storium, defineStore, belongsTo, ValidationError, ... }
│   ├── connect.ts              # Connection factory — connect() / fromDrizzle(); dialect-specific Drizzle wiring + register()
│   ├── types.ts                # All shared TypeScript types (Dialect, ColumnAnnotation, StoreConfig, Store, RepositoryContext, ...)
│   ├── errors.ts               # ValidationError, ConfigError, SchemaError, StoreError
│   ├── assertions.ts           # createTestFn(), createAssertionRegistry(), BUILTIN_ASSERTIONS — the test() helper for validate callbacks
│   ├── store/
│   │   ├── index.ts            # Store-module barrel
│   │   ├── define.ts           # defineStore(drizzleTable, config?) — wraps a Drizzle table with storium metadata; returns StoreDefinition
│   │   ├── repository.ts       # createRepository() — default CRUD + soft-delete ops + custom-query context (ctx)
│   │   └── prep.ts             # Validation/transform pipeline (filter → transform → validate → required)
│   ├── schema/
│   │   ├── zod.ts              # Drizzle column introspection → Zod schemas; buildSchemaSet() → { create/update/select/full } RuntimeSchemas
│   │   └── json.ts             # Drizzle column introspection → JSON Schema (Fastify/Ajv edge validation)
│   ├── mixins/
│   │   ├── index.ts            # Mixins barrel
│   │   ├── belongsTo.ts        # JOIN mixin for belongs-to relationships
│   │   ├── hasMany.ts          # One-to-many relationship mixin
│   │   ├── hasOne.ts           # One-to-one relationship mixin
│   │   ├── withMembers.ts      # Many-to-many membership mixin
│   │   ├── withCache.ts        # Caching wrapper
│   │   └── withPagination.ts   # Pagination wrapper
│   └── migrate/                # Sub-path export `storium/migrate` (heavy deps, opt-in)
│       ├── index.ts            # Migrate barrel — generate, migrate, push, status, seed, defineSeed, collectSchemas
│       ├── commands.ts         # generate(), migrate(), push(), status() — drizzle-kit CLI + drizzle-orm migrators
│       ├── collector.ts        # collectSchemas(globs) — imports schema files, extracts storium + raw Drizzle tables (fatal on import failure)
│       ├── config.ts           # loadConfig() — reads config from drizzle.config.ts
│       └── seed.ts             # defineSeed(), seed(db, config?) — runs seed files (fatal on store/schema import failure)
├── examples/                   # 11 runnable single-file examples: basic, custom-queries, validation, memory,
│                               #   from-drizzle, postgresql, mysql, sqlite, fastify, migrations, relations
├── test/
│   ├── setup.ts                # Global vitest setup (minimal)
│   ├── tables.ts               # Shared Drizzle tables for tests
│   ├── dialects.ts             # Dialect matrix helpers (TEST_DIALECTS)
│   └── integration/            # testcontainers integration suite (postgres + mysql) — run via vitest.integration.config.ts
├── docs/                       # Long-form docs (type-safety, custom-queries, relationships, migrations, validation, ...)
├── .github/workflows/
│   ├── ci.yml                  # CI — `checkride --strict` (Node 22.x/24.x) + integration (Docker)
│   ├── release.yaml            # vX.Y.Z tag → GitHub Release, notes from the matching CHANGELOG section
│   └── publish.yaml            # vX.Y.Z tag → full check + integration via checkride, then pnpm publish --provenance (Trusted Publishing, npm-publish env)
├── CONTRIBUTING.md             # Dev setup, test suite, the better-sqlite3 rebuild note
├── checkride.config.json       # The check gate — every slot and how it is wired (`pnpm check`)
├── sgconfig.yml                # ast-grep config (root) — points at .ast-grep/rules/ (the `struct` check)
├── .markdownlint-cli2.jsonc    # markdownlint config (the `docs` check)
├── cspell.json                 # cspell config (the `spell` check)
├── scripts/
│   └── fix-dts-type-exports.mjs # Post-build: re-qualify type-only exports in dist decls (dts bundler drops `type`)
├── pnpm-workspace.yaml         # pnpm settings: examples/* as workspace packages, allowBuilds for native deps
├── tsup.config.ts              # Build config
├── vitest.config.ts            # Unit test config — src/**/__tests__/**/*.test.ts
└── vitest.integration.config.ts # Integration test config — test/integration/**/*.test.ts
```

> Note: column introspection (`drizzleColumnToZod` / `drizzleColumnToJsonSchema`)
> lives inside `src/schema/zod.ts` and `src/schema/json.ts` — there is no separate
> `introspect.ts`. The legacy `src/core/` layout (defineTable.ts, dialect.ts,
> indexes.ts, runtime.schema.ts, configLoader.ts) no longer exists.

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

- Package manager: **pnpm** (exact version pinned in `package.json` `packageManager`; `corepack enable` once). Examples are workspace packages, so one root `pnpm install` covers everything.
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
  logger: customLogger,  // optional Logger ({ log, warn, error }); defaults to console
  driverOptions: { ssl: { rejectUnauthorized: false } },  // passed through to pg.Pool / mysql2.createPool / better-sqlite3
})
```

`driverOptions` (optional) is spread into the driver's pool/client constructor —
`pg.PoolConfig`, `mysql2.PoolOptions`, or `better-sqlite3.Options` by dialect.
It is the escape hatch for TLS, timeouts, `application_name`, `verbose`, and
anything else storium doesn't model. Storium's own keys win: the URL comes only
from `url` / `dbCredentials` (a `connectionString` / `uri` in `driverOptions`
throws `ConfigError`), and `pool.min` / `pool.max` override the same keys in
`driverOptions`. Untyped (`Record<string, unknown>`) because the drivers are
optional peers. Never name this key `driver`: drizzle-kit reserves `driver` in
the shared config file for its own driver enum and rejects any other value.

`logger` (optional) sinks storium's own diagnostics — the `defineStore`
re-config warning and the seed runner's progress/error lines. Defaults to
`console`; resolved and exposed as `db.logger`. Pass a custom `Logger` to
silence or redirect them.

`password` (optional) is a string, or on **postgresql** a per-connection
function (`PasswordFn`, `() => string | Promise<string>`) that pg resolves each
time the pool opens a connection — the hook for rotating credentials (RDS IAM,
Cloud SQL IAM, Vault). On the function branch storium builds the pool from
`host`/`port`/`user`/`database` (parsed from `url`) instead of a
`connectionString`, so a `url` beside a function must carry no password and no
query params (`ConfigError` otherwise; put `ssl` etc. in `driverOptions`). A
function on `mysql` / `sqlite` / `memory` is a `ConfigError`. This means
rotating-credential setups no longer need `fromDrizzle()` with a hand-built pool.

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
  softDelete?: boolean       // requires deletedAt column on Drizzle table
  conflictTarget?: string[]  // default columns for upsert conflict detection (overridden by per-call opts)
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
store.destroy(id, opts?)             // returns the deleted row
store.destroyAll(filters, opts?)
```

### Query opts

`QueryOptions<TTable>` is generic — `where` callback receives the typed table for column autocomplete.

```typescript
{
  tx?: any                           // Transaction handle
  limit?: number
  offset?: number
  orderBy?: OrderBySpec | OrderBySpec[]
  where?: (table: TTable) => SQL     // Typed Drizzle WHERE clause
  conflictTarget?: string[]          // Upsert conflict columns (overrides StoreConfig default)
}
```

`PrepOptions` extends `QueryOptions` with internal escape hatches (available in custom queries via `ctx`):

```typescript
{
  skipPrep?: boolean                 // Bypass prep pipeline
  includeHidden?: boolean            // Include hidden columns in result
  validateRequired?: boolean         // Enforce required fields
  onlyWritable?: boolean             // Strip non-writable keys
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
Relationship mixins auto-filter soft-deleted related rows when the related table has `softDelete: true`.

### withMembers transaction support

All `withMembers` methods accept an optional `opts` parameter with `tx` for transaction support:

```typescript
await teams.addMember(teamId, userId, {}, { tx })
await teams.removeMember(teamId, userId, { tx })
await teams.getMembers(teamId, { tx })
await teams.isMember(teamId, userId, { tx })
await teams.getMemberCount(teamId, { tx })
```

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
- Optional isolation level: `db.transaction(fn, { isolationLevel })` where
  `isolationLevel` is `'read uncommitted' | 'read committed' | 'repeatable read'
  | 'serializable'`. Plumbed to Drizzle on PostgreSQL/MySQL; **ignored on
  SQLite/`memory`** (inherently serializable).

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
  schema: ['./src/**/*.table.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies StoriumConfig
```

### Schema files (for migrations)

Export `StoreDefinition` (from `defineStore()`) or raw Drizzle tables.
`schemaCollector` detects both patterns for drizzle-kit compatibility.

### Recommended app structure (folder-per-store)

```text
project/
├── drizzle.config.ts
├── database.ts                    # connect + register all stores
├── entities/
│   └── users/
│       ├── user.table.ts          # pgTable('users', { ... })
│       ├── user.queries.ts        # Custom query functions
│       └── user.store.ts          # defineStore(usersTable, { columns: {...} }).queries({...})
├── collections/
│   └── user-roles/
│       ├── user-role.table.ts     # pgTable('user_roles', { ... })
│       └── user-role.store.ts     # defineStore(table).queries({ ...withMembers(...) })
```

## Design philosophy

- **Pre-1.0: API design is the priority.** There are no users yet. Breaking changes are welcome if they produce a better API. Do not justify design decisions with "this matches current behavior" — evaluate on merit.
- **Drizzle is Drizzle.** Users define tables with native Drizzle syntax. Storium adds validation, access control, CRUD, and schemas on top — it doesn't replace Drizzle's column DSL.

## Example conventions

- Single `app.ts` — everything in one runnable file
- `package.json`: `"start": "tsx app.ts"`, `storium: "workspace:*"`, `tsx` in devDeps
- In-memory examples: `dialect: 'memory'`, `db.drizzle.run(sql\`CREATE TABLE...\`)`
- Multi-file pattern: `Drizzle table → defineStore().queries() → storium.connect → db.register → use stores`
- Simple pattern: `storium.connect → db.defineStore(drizzleTable, config) → use store`
- Console output: `=== Section name ===` headers matching style of existing examples
- Always `await db.disconnect()` at end

<!-- checkride:begin hash=v1f22a98eb5436b100 -->

## Checkride: the definition of done

`pnpm check` is the single source of truth for "done". Exit 0 means the work is
complete; any other exit code means it is not. Never claim a task is finished while
`pnpm check` is red.

When it fails:

1. Read `.check/summary.json` to see which check failed.
2. Read that check's raw output (`.check/<slot>.json` or `.check/<slot>.stdout.txt`).
3. Fix the root cause, then re-run.

`pnpm exec checkride triage` runs this procedure in full and reads `.check/` for you
(`/checkride:check` and `/checkride-check` are the same thing as a skill).

Tight feedback loops: `pnpm check --bail`, `pnpm check --only types,lint`, and
`pnpm check --changed`.

If a stop-gate hook is configured (`.claude/settings.json` or `.cursor/hooks.json`),
it runs the check when a turn ends — so while iterating, prefer the narrow commands
above rather than running the full check yourself every loop. Read the gate's verdict
rather than assuming it covered everything: a repo can narrow the gate with `gate` in
`checkride.config.json`, and a narrowed one names its narrowing (`only …`, `without …`,
`affected-only`) in every verdict. That green is not the "done" defined above; run
`pnpm check` in full before you claim the work is finished.

### Baseline

If `checkride.baseline.json` is present, checkride grandfathers the diagnostics it
lists: a slot is green as long as only baselined findings remain, while a genuinely
new diagnostic still fails it. Fixing a baselined finding prunes it from the file —
the ratchet, so the baseline only ever shrinks. Never add to the baseline to make a
check pass; fix the finding.

### Module boundaries

The `struct` check runs whatever ast-grep rules `sgconfig.yml` points at
(`rules/` by default). Those files are this repo's boundary convention —
read them rather than assuming one.

Active checks in this repo: types, lint, struct, links, deps, dead, dupes, health, docs, spell, build, publint, attw, pack, smoke, typecheck-examples, test.

<!-- checkride:end -->
