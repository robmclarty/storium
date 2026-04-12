# PostgreSQL

Full PostgreSQL lifecycle with a real database via Docker, migrations, seeds, and dialect-specific queries.

## What it demonstrates

- Multi-file organization: separate table, store, and query files per entity
- Migration generation and application against a live PostgreSQL instance
- Seed data with `ref()` for FK resolution
- CRUD operations with `orderBy`, `findByIdIn`, hidden columns + `includeHidden`
- PostgreSQL-specific features: `jsonb` columns, native `text[]` arrays, array containment (`@>`), `ILIKE`
- Transactions
- Validation with `ValidationError`
- Runtime schemas

## Project structure

```
postgresql/
  entities/users/    user.table.ts, user.store.ts, user.queries.ts
  entities/posts/    post.table.ts, post.store.ts, post.queries.ts
  seeds/001_seed.ts
  storium.config.ts
  database.ts             Connection setup
  temporaryDatabase.ts    Docker container management
  app.ts                  Full feature walkthrough
```

## Prerequisites

- **Docker** must be running (uses testcontainers to spin up a PostgreSQL instance automatically)

## Install and run

```bash
npm install
npm start
```

A temporary PostgreSQL container is created on startup and destroyed on exit. No manual database setup required.
