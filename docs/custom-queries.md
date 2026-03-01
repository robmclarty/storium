# Custom Queries

Custom queries are how you extend stores with domain-specific operations. They're the primary way to go beyond default CRUD while staying inside the Storium pattern.

## The Pattern

Every custom query follows the same shape:

```typescript
(ctx) => async (...yourArgs) => result
```

It's a factory function that receives `ctx` and returns the actual query function. This two-step pattern exists so that `ctx` captures references to the *original* default CRUD methods — even if you override one by name, `ctx.create` always points to the built-in version.

## Context (`ctx`)

The context object contains everything you need:

| Property | Description |
|----------|-------------|
| `ctx.drizzle` | Drizzle database instance (`DrizzleDatabase<D>`) — typed to the concrete Drizzle class when dialect is known. Full query builder access. |
| `ctx.zod` | The Zod namespace (`z`) — convenience accessor. |
| `ctx.table` | The Drizzle table object (column references for `.where()`, `.select()`, etc.). |
| `ctx.selectColumns` | Pre-built column map for SELECT (excludes `hidden` columns). |
| `ctx.allColumns` | Full column map including `hidden` columns. |
| `ctx.primaryKey` | Primary key column name (string). |
| `ctx.schemas` | `SchemaSet` with `createSchema`, `updateSchema`, `selectSchema`, `fullSchema`. |
| `ctx.prep()` | The validation/transform pipeline function. |
| `ctx.find()` | Default find (by filters). |
| `ctx.findAll()` | Default find all. |
| `ctx.findOne()` | Default find one. |
| `ctx.findById()` | Default find by primary key. |
| `ctx.findByIdIn()` | Default find by multiple IDs. |
| `ctx.create()` | Default create. |
| `ctx.update()` | Default update. |
| `ctx.destroy()` | Default destroy. |
| `ctx.destroyAll()` | Default destroy all. |
| `ctx.ref()` | Default ref (look up PK by filter). |

All CRUD methods on `ctx` are always the **original** built-in versions, even if you override them by name in your queries.

## Composing with Built-in CRUD

The simplest custom queries delegate to built-in methods:

```typescript
const userStore = defineStore(usersTable).queries({
  findByEmail: (ctx) => async (email: string) =>
    ctx.findOne({ email }),

  findByRole: (ctx) => async (role: string) =>
    ctx.find({ role }),

  findActive: (ctx) => async () =>
    ctx.find({ active: true }),
})
```

## Overriding Defaults

Override a default method by using the same name. The original is still available on `ctx`:

```typescript
const userStore = defineStore(usersTable).queries({
  // Override create — hash password before insert
  create: (ctx) => async (input, opts) => {
    const hashed = { ...input, password: await hash(input.password) }
    return ctx.create(hashed, { ...opts, force: true })
  },

  // Override update — set updated_at automatically
  update: (ctx) => async (id, input, opts) => {
    return ctx.update(id, { ...input, updated_at: new Date() }, opts)
  },
})
```

No infinite recursion — `ctx.create` is the built-in, not your override.

## Raw Drizzle Queries

For anything the built-in methods can't express, use `ctx.drizzle` directly:

```typescript
import { like, desc, eq, sql } from 'drizzle-orm'

const articleStore = defineStore(articlesTable).queries({
  // Full-text search
  search: (ctx) => async (term: string) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(like(ctx.table.title, `%${term}%`)),

  // Sorting and limiting
  mostViewed: (ctx) => async (limit = 10) =>
    ctx.drizzle
      .select(ctx.selectColumns)
      .from(ctx.table)
      .where(eq(ctx.table.status, 'published'))
      .orderBy(desc(ctx.table.view_count))
      .limit(limit),

  // Raw SQL for atomic operations
  incrementViews: (ctx) => async (id: string) => {
    ctx.drizzle.run(
      sql`UPDATE articles SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ${id}`
    )
    return ctx.findById(id)
  },
})
```

Use `ctx.selectColumns` in `.select()` to get the same column set as the default CRUD methods (respecting `hidden`).

## Domain Actions

Custom queries don't have to be "queries" — they can represent any domain operation:

```typescript
const articleStore = defineStore(articlesTable).queries({
  publish: (ctx) => async (id: string) =>
    ctx.update(id, { status: 'published', published_at: new Date() }),

  unpublish: (ctx) => async (id: string) =>
    ctx.update(id, { status: 'draft', published_at: null }),

  archive: (ctx) => async (id: string) =>
    ctx.update(id, { status: 'archived' }),
})
```

## Transaction Passthrough

Custom queries that delegate to built-in methods automatically support transactions via the `opts` parameter:

```typescript
const orderStore = defineStore(ordersTable).queries({
  createWithItems: (ctx) => async (order: any, items: any[]) => {
    // Use db.transaction() from outside, then pass { tx } through opts
    const created = await ctx.create(order)
    for (const item of items) {
      await itemStore.create({ ...item, order_id: created.id })
    }
    return created
  },
})

// Usage
await db.transaction(async (tx) => {
  await orders.createWithItems(
    { customer_id: '123' },
    [{ product_id: 'a', qty: 2 }, { product_id: 'b', qty: 1 }]
  )
})
```

For raw Drizzle queries inside a transaction, accept `opts` and use the transaction handle:

```typescript
transferFunds: (ctx) => async (fromId: string, toId: string, amount: number, opts?: any) => {
  const drizzle = opts?.tx ?? ctx.drizzle
  drizzle.run(sql`UPDATE accounts SET balance = balance - ${amount} WHERE id = ${fromId}`)
  drizzle.run(sql`UPDATE accounts SET balance = balance + ${amount} WHERE id = ${toId}`)
}
```

## Reusable Mixins

A mixin is just a plain object of query functions. Spread it into any store:

```typescript
// mixins/withSoftDelete.ts
export const withSoftDelete = {
  destroy: (ctx) => async (id, opts?) =>
    ctx.update(id, { deleted_at: new Date() }, opts),

  findActive: (ctx) => async () =>
    ctx.drizzle.select(ctx.selectColumns)
      .from(ctx.table)
      .where(eq(ctx.table.deleted_at, null)),
}

// user.store.ts
const userStore = defineStore(usersTable).queries({
  ...withSoftDelete,
  findByEmail: (ctx) => async (email) => ctx.findOne({ email }),
})
```

Mixins compose with each other and with Storium's built-in mixins (`withBelongsTo`, `withMembers`) via spread.

## Tips

- **Use `ctx.selectColumns`** in raw Drizzle selects to exclude `hidden` columns automatically.
- **Return from `ctx` methods** rather than reimplementing CRUD — you get prep pipeline validation for free.
- **Pass `{ force: true }`** when calling `ctx.create` or `ctx.update` with pre-validated data to skip the pipeline.
- **Typing `ctx` in separate files**: Queries defined inline in `defineStore()` get full `ctx` inference automatically. For queries in separate files, import and annotate: `(ctx: Ctx) =>`. This matches the same pattern as Fastify handlers — inline gets inference, imported gets explicit typing. The same applies to `transform` and `validate` callbacks pulled into separate files (`TestFn` is exported for `validate`'s second parameter).
