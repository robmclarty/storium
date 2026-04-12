# Custom Queries

Demonstrates how to extend stores with domain-specific operations using the `(ctx) => async (...args) => result` pattern.

## What it demonstrates

- The `ctx` object: `drizzle`, `table`, `selectColumns`, `prep()`, and all built-in CRUD methods
- Composing custom queries on top of built-in CRUD (`ctx.findOne`, `ctx.update`)
- Overriding default methods (auto-slug generation on `create`)
- Raw Drizzle queries via `ctx.drizzle` (full-text search, sorting, limiting)
- Raw SQL for atomic operations (`incrementViews`)
- Domain actions (`publish`, `unpublish`)
- Transaction support inside custom queries

## Install and run

```bash
npm install
npm start
```

Uses an in-memory SQLite database — no external database required.
