# Storium

A lightweight, database-agnostic storage toolkit built on [Drizzle](https://orm.drizzle.team) and [Zod](https://zod.dev/).

I built Storium because Drizzle gives you a fantastic query builder, but every project still needs the same scaffolding on top of it: validation, sanitization, CRUD operations, migration workflows, and some coherent pattern tying it all together. I kept rebuilding that scaffolding. Poorly, at first. Then well enough that I stopped wanting to rewrite it, which felt like a milestone worth shipping.

Define your schema once with `defineStore()` and Storium generates a full stack of contracts around it: TypeScript types for compile-time safety, Zod schemas for runtime validation, and JSON Schema for APIs and external tooling (e.g., Fastify/Ajv). You get standard CRUD, custom query hooks powered by Drizzle's query builder, and migration tooling. One definition, every layer covered. No more redeclaring the same shape in three different formats and hoping they don't drift apart over time.

The goal is a data-access layer that's structured enough to keep things consistent and predictable, but flexible enough that you're never fighting it. You define the stores, the queries, the transforms. Storium just makes it harder to stray from the pattern -- especially six months in when the codebase would have otherwise quietly rotted into three different ways of talking to the database.

## Quick Start

```bash
npm install storium drizzle-orm drizzle-kit zod

# Plus your database driver of choice:
npm install pg             # PostgreSQL
npm install mysql2         # MySQL
npm install better-sqlite3 # SQLite
```

```typescript
import { storium } from 'storium'

const db = storium.connect({
  dialect: 'postgresql',
  url: process.env.DATABASE_URL,
})

const users = db.defineStore('users', {
  id:    { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  name:  { type: 'varchar', maxLength: 255, mutable: true },
})

const user = await users.create({ email: 'alice@example.com', name: 'Alice' })
const found = await users.findById(user.id)
await users.update(user.id, { name: 'Alice B.' })
```

## Features

- **Single source of truth** — one schema definition drives TypeScript types, JSON Schema, Zod schemas, and database migrations
- **Repository pattern** — default CRUD with extensible custom queries
- **Three-tier validation** — JSON Schema for the HTTP edge, Zod for runtime, prep pipeline for business rules
- **Database agnostic** — PostgreSQL, MySQL, and SQLite via Drizzle
- **Composable helpers** — `withBelongsTo`, `withMembers`, `withCache`, `withTransaction`
- **Fastify integration** — `toJsonSchema()` for route validation
- **Migration tooling** — thin CLI wrapping drizzle-kit
- **Stands back** — Storium doesn't try to own your architecture. It gives you tools and gets out of the way.

## Core Concepts

### Column Definitions

Three modes for every column, depending on how much control you need:

```typescript
// DSL (90% of cases — just declare what it is)
email: { type: 'varchar', maxLength: 255, mutable: true }

// DSL + custom (one Drizzle tweak on top)
email: { type: 'varchar', maxLength: 255, custom: col => col.unique() }

// Raw (full Drizzle control — Storium steps aside entirely)
meta: { raw: () => jsonb('meta').default({}) }
```

Column metadata (`mutable`, `hidden`, `required`, `transform`, `validate`) works with all modes. The `transform` callback runs before validation and is where you'd put sanitization (trim, lowercase), enrichment, or any other pre-save logic. Basically anything you'd otherwise scatter across your route handlers ;)

### Custom Queries

This is where Storium really earns its keep. Custom queries receive `ctx` with the database handle and all default CRUD operations. You can override defaults by name. `ctx` always has the originals, so you can compose on top of them rather than starting from scratch:

```typescript
const users = db.defineStore('users', columns, {
  queries: {
    // Override create — hash password before insert
    create: (ctx) => async (input, opts) => {
      const hashed = { ...input, password: await hash(input.password) }
      return ctx.create(hashed, { ...opts, force: true })
    },

    // New query — just write Drizzle like you normally would
    findByEmail: (ctx) => async (email) =>
      ctx.drizzle.select(ctx.selectColumns)
        .from(ctx.table)
        .where(eq(ctx.table.email, email))
        .then(r => r[0] ?? null),
  },
})
```

The pattern is always the same: `(ctx) => async (...yourArgs) => result`. Storium gives you the tools via `ctx`, you decide what to do with them.

### Schemas

Every store generates runtime schemas that you can use however you like. I find this especially handy for keeping validation consistent between my API layer and my business logic without duplicating definitions (and trying to keep them all in sync):

```typescript
// Validate input (throws ValidationError)
users.schemas.insert.validate(data)

// Try without throwing
const result = users.schemas.insert.tryValidate(data)

// JSON Schema (e.g., as used by Fastify)
app.post('/users', {
  schema: { body: users.schemas.insert.toJsonSchema() },
})

// Zod for composition
const extended = users.schemas.insert.zod.extend({ extra: z.string() })
```

### Index DSL

```typescript
indexes: {
  email: { unique: true },                         // → users_email_unique
  school_id: {},                                   // → users_school_id_idx
  school_role: { columns: ['school_id', 'role'] }, // → users_school_role_idx
  active_email: {                                  // Partial index
    columns: ['email'],
    unique: true,
    where: (table) => isNull(table.deleted_at),
  },
  search: {                                        // Raw (full Drizzle control)
    raw: (table) => index('search_gin').using('gin', table.search_vector),
  },
}
```

## Scaling Up

The Quick Start uses `db.defineStore()` — the simplest path. But as a project grows, you may want schema definitions separated from store logic. Three reasons:

- **Migration tooling** — `drizzle-kit` imports schema files at module level, before any database connection exists. Standalone `defineTable()` files work at module scope; `db.defineStore()` can't because it requires a live connection.
- **Organization** — Schemas, queries, and wiring live in separate files. Easier to navigate when you have 50+ tables.
- **Testability** — Store definitions are inert DTOs. You can unit-test query functions or compose stores without a live database.

The pattern looks like this:

```
entities/
└── users/
    ├── user.schema.ts    ← defineTable (pure schema, no connection)
    ├── user.queries.ts   ← query functions
    └── user.store.ts     ← defineStore (bundles schema + queries)
database.ts               ← connect + register all stores
```

**Schema file** — importable by drizzle-kit for migration generation:

```typescript
// entities/users/user.schema.ts
import { defineTable } from 'storium'

export const usersTable = defineTable('postgresql')('users', {
  id:    { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  name:  { type: 'varchar', maxLength: 255, mutable: true },
}, {
  indexes: { email: { unique: true } },
})
```

**Store file** — bundles the schema with custom queries into an inert DTO:

```typescript
// entities/users/user.store.ts
import { defineStore } from 'storium'
import { usersTable } from './user.schema'
import { eq, ilike } from 'drizzle-orm'

export const userStore = defineStore(usersTable, {
  findByEmail: (ctx) => async (email: string) =>
    ctx.drizzle.select(ctx.selectColumns)
      .from(ctx.table)
      .where(eq(ctx.table.email, email))
      .then(r => r[0] ?? null),

  search: (ctx) => async (query: string) =>
    ctx.drizzle.select(ctx.selectColumns)
      .from(ctx.table)
      .where(ilike(ctx.table.name, `%${query}%`)),
})
```

**Database file** — one composition point that wires everything together:

```typescript
// database.ts
import { storium } from 'storium'
import { userStore } from './entities/users/user.store'
import { postStore } from './entities/posts/post.store'

const db = storium.connect({
  dialect: 'postgresql',
  url: process.env.DATABASE_URL,
})

export const { users, posts } = db.register({ users: userStore, posts: postStore })
```

`defineTable` has three calling conventions depending on how you manage the dialect:

```typescript
// Explicit dialect (curried) — no config file needed
const usersTable = defineTable('postgresql')('users', columns, options)

// Auto-detect dialect from drizzle.config.ts
const usersTable = defineTable('users', columns, options)

// Bound function for reuse across multiple tables
const dt = defineTable('postgresql')
const usersTable = dt('users', columns)
const postsTable = dt('posts', columns)
```

## Helpers

Storium ships a small set of composable helpers for relationship and caching patterns that come up constantly. Rather than writing the same join logic in every project, you can drop these in and move on.

### withBelongsTo

```typescript
import { withBelongsTo } from 'storium'

const userStore = defineStore(usersTable, {
  ...withBelongsTo(schools, 'school_id', { alias: 'school', select: ['name'] }),
})

const { users } = db.register({ users: userStore })
const user = await users.findWithSchool(userId)
```

### withMembers

```typescript
import { withMembers } from 'storium'

const teamStore = defineStore(teamsTable, {
  ...withMembers(teamMembers, 'team_id'),
})

const { teams } = db.register({ teams: teamStore })
await teams.addMember(teamId, userId, { role: 'captain' })
await teams.isMember(teamId, userId)
```

### withCache

```typescript
import { withCache } from 'storium'

const cachedUsers = withCache(users, redisAdapter, {
  findById: { ttl: 300, key: (id) => `user:${id}` },
})
```

### Transactions

```typescript
const result = await db.withTransaction(async (tx) => {
  const user = await users.create({ name: 'Alice' }, { tx })
  const team = await teams.create({ name: 'Alpha', owner_id: user.id }, { tx })
  return { user, team }
})
```

## Fastify Integration

Storium's JSON Schema output plugs directly into Fastify's route validation via `toJsonSchema()`. Extend it inline as needed:

```typescript
const insertSchema = users.schemas.insert.toJsonSchema()

app.post('/users', {
  schema: {
    body: {
      ...insertSchema,
      properties: {
        ...insertSchema.properties,
        invite_code: { type: 'string', minLength: 8 },
      },
      required: [...(insertSchema.required ?? []), 'invite_code'],
    },
  },
}, handler)
```

## Migrations

Storium wraps drizzle-kit with a thin CLI so you don't have to configure it directly. Schema changes are diffed automatically. Define your columns, run `generate`, and apply.

```bash
npx storium generate   # Diff schemas → create SQL migration
npx storium migrate    # Apply pending migrations
npx storium push       # Push directly (dev only)
npx storium status     # Check migration state
npx storium seed       # Run seed files
```

Configuration in `drizzle.config.ts` — a single config shared by drizzle-kit and storium:

```typescript
import type { ConnectConfig } from 'storium'

export default {
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schema: ['./src/entities/**/*.schema.ts'],
  out: './migrations',
  seeds: './seeds',
} satisfies ConnectConfig
```

## Escape Hatches

Storium is not trying to be a walled garden. Every abstraction has a way out.

### Drizzle

Direct Drizzle access is always available. If you need to drop down a level, nothing is stopping you:

```typescript
// Raw Drizzle instance
db.drizzle.execute(sql`SELECT 1`)

// Bring your own Drizzle (dialect auto-detected)
import { storium } from 'storium'
const db = storium.fromDrizzle(myDrizzleInstance)

// Raw columns bypass the DSL entirely
meta: { raw: () => jsonb('meta').default({}) }

// Raw indexes bypass the index DSL entirely
search: { raw: (table) => index('search_gin').using('gin', table.search_vector) }

// Custom queries give you the full Drizzle query builder
findByEmail: (ctx) => async (email) =>
  ctx.drizzle.select(ctx.selectColumns)
    .from(ctx.table)
    .where(eq(ctx.table.email, email))
    .then(r => r[0] ?? null)
```

### Zod

Every generated schema exposes its underlying Zod schema directly. Use it to compose, extend, or integrate with any Zod-aware library:

```typescript
// Extend a generated schema
const signupSchema = users.schemas.insert.zod.extend({
  password: z.string().min(8),
  invite_code: z.string().optional(),
})

// Compose schemas
const loginSchema = z.object({
  email: users.schemas.insert.zod.shape.email,
  password: z.string(),
})

// Use with any Zod-compatible library (tRPC, react-hook-form, etc.)
const router = t.router({
  createUser: t.procedure.input(users.schemas.insert.zod).mutation(...)
})
```

## License

MIT
