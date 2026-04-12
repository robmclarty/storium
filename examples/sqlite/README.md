# SQLite

Full SQLite lifecycle with a file-based database, migrations, seeds, and dialect-specific queries.

## What it demonstrates

- Multi-file organization: separate table, store, and query files per entity
- Migration generation and application
- Seed data with `ref()` for FK resolution
- CRUD operations with `orderBy`, `findByIdIn`, hidden columns + `includeHidden`
- SQLite-specific features: `json_each()` for array queries, `json_extract()` for nested JSON
- Transactions
- Validation with `ValidationError`
- Runtime schemas

## Project structure

```
sqlite/
  entities/users/    user.table.ts, user.store.ts, user.queries.ts
  entities/posts/    post.table.ts, post.store.ts, post.queries.ts
  seeds/001_seed.ts
  storium.config.ts
  database.ts        Connection setup
  app.ts             Full feature walkthrough
```

## Install and run

```bash
npm install
npm start
```

Uses a file-based SQLite database via better-sqlite3 (created and cleaned up automatically).
