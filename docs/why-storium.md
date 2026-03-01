# Why Storium?

Storium is a schema-driven policy layer for data access built on top of
[Drizzle](https://orm.drizzle.team/) and [Zod](https://zod.dev/). It
doesn't replace either library — it provides a declarative DSL that derives
tables, validation schemas, and repository operations from a single source of
truth.

## The Problem

Any app using Drizzle and Zod together faces a recurring coordination problem.
For every table you need to:

- Define a Drizzle table with column types, defaults, and constraints.
- Define separate Zod schemas for insert, update, and select operations.
- Keep those schemas in sync as the table evolves.
- Decide where input sanitization and validation live.
- Write CRUD boilerplate that respects which fields are writable, which are
  readonly, and which are hidden from output.

None of these are hard individually. But they're decisions made *repeatedly*,
*inconsistently*, and *silently wrong* when someone forgets. The cost compounds
with every table you add.

## What Storium Does

A single `defineTable()` call replaces all of the above. You describe each
column once with its type and access metadata — `readonly`, `hidden`,
`required` — and Storium derives everything else:

- A **Drizzle table** ready for migrations and queries.
- **Zod schemas** for create, update, select, and full validation, with
  transforms and custom validation baked in.
- **JSON Schema** output for HTTP-layer validation (e.g., Fastify/Ajv).
- A **repository** with default CRUD operations that respect column access
  rules.
- A **prep pipeline** (filter, transform, validate, required) that runs
  automatically on every write.

The DSL isn't really an abstraction over Drizzle and Zod — it's a **policy
language** for data access patterns. You're not learning "how to make a
column." You're declaring "this field is readonly" or "this field is hidden
from output." That's a higher-level concern that Drizzle and Zod don't
address on their own.

## Convenience Without Lock-In

Storium is designed with escape hatches at every level so you're never painted
into a corner:

- **Column-level**: Use `custom` to tweak the auto-built Drizzle column, or
  `raw` to bypass the DSL entirely while keeping metadata like `readonly`,
  `hidden`, and `validate`.
- **Index-level**: Use the index DSL for common cases, or `raw` for full
  Drizzle index control (e.g., GIN indexes).
- **Query-level**: Custom queries receive a `ctx` with full Drizzle access
  (`ctx.drizzle`, `ctx.table`) alongside all default CRUD methods.
- **Schema-level**: Every generated schema exposes `.zod` for direct access to
  the underlying Zod schema for composition, extension, or override.
- **Instance-level**: Access the raw Drizzle instance via `db.drizzle`, or
  bring your own with `fromDrizzle()`.
- **Pipeline-level**: Pass `force: true` to any write operation to skip the
  entire prep pipeline.

The goal is that ~80% of your work stays in Storium's DSL, ~15% uses custom
queries through `ctx`, and ~5% drops down to raw Drizzle. The library earns
its keep on the common case and gets out of the way for the rest.

## For Solo Developers

If you're working alone, the value is straightforward: less boilerplate, fewer
places to forget things, and one place to change when a table evolves. The
prep pipeline means validation and sanitization happen automatically on every
write without you having to remember to wire them up. The schema sync problem
— where your Zod schemas drift from your Drizzle table after a migration —
goes away entirely.

The cognitive load of learning `readonly`, `hidden`, `required`, and the custom
query pattern is paid once. The cognitive load of manually maintaining schema
parity across Drizzle and Zod is paid forever.

## For Teams

The solo dev case is nice-to-have. The team case is where Storium shifts from
convenience to infrastructure.

### The problem at scale isn't boilerplate — it's drift.

On a team with many engineers and many tables, patterns diverge quickly.
One engineer puts validation in middleware. Another puts it in a Zod schema.
Another puts it in a repository method. Another forgets entirely. Six months
in, nobody knows where input sanitization happens for any given table without
reading the code. Code review becomes archaeology.

Storium eliminates that class of inconsistency. If the rule is "all tables go
through `defineTable`, all stores through `defineStore`, all custom queries
use `ctx`," then:

- Validation **always** lives in column definitions.
- Transforms **always** run before writes.
- Hidden fields **never** leak into API responses.
- There's **one pattern** to learn, one pattern to code review, one pattern to
  grep for when something goes wrong.

### Structured custom queries

The `(ctx) => async (...args) => result` pattern for custom queries is
constraining in exactly the right way. You can do anything with `ctx.drizzle`, but
the structure forces you to:

- Colocate queries with their table.
- Receive dependencies through a known interface.
- Produce a function with a clear signature.

That's much easier to review and refactor than ad-hoc repository patterns
scattered across service files.

### Automatic guard-rails

The prep pipeline — filter, transform, validate, required — isn't just
convenient, it's an opinion about correctness that every write path follows. A
new engineer can't accidentally skip validation because the pipeline runs
automatically. They have to opt out with `force: true`, which is grep-able and
reviewable.

Making the wrong thing hard to do silently is exactly what team infrastructure
should provide.

## The Trade-Off

Storium is additive cognitive load on top of Drizzle and Zod. Your engineers
still need to know Drizzle for custom queries and Zod for edge cases. But in
practice, most table definitions will be pure DSL, most queries will be default
CRUD or simple custom queries, and the escape hatches will be occasional.

The DSL earns its keep not because it's less code, but because it makes the
right thing automatic and the wrong thing visible.
