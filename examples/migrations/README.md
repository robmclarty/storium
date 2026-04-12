# Migrations

Full migration lifecycle: generate, status, migrate, and seed ��� both programmatic API and CLI.

## What it demonstrates

- `storium.config.ts` auto-discovery and loading
- Programmatic workflow: `generate()`, `status()`, `migrate()`, `seed()`
- Equivalent CLI commands: `npx storium generate`, `npx storium migrate`, etc.
- Store auto-discovery in seeds (custom queries available in seed functions)
- Multi-file organization with separate table and store files

## Project structure

```
migrations/
  entities/tasks/task.table.ts   Drizzle table definition
  entities/tasks/task.store.ts   Store with custom queries
  seeds/001_tasks.ts             Seed data
  storium.config.ts              Config (auto-loaded by CLI and API)
  app.ts                         Programmatic migration workflow
```

## Install and run

```bash
npm install
npm start
```

Runs the full lifecycle programmatically. You can also use the CLI:

```bash
npx storium generate   # Diff schemas, create SQL migration
npx storium status     # Show migration state
npx storium migrate    # Apply pending migrations
npx storium seed       # Run seed files
```

Uses a file-based SQLite database (created and cleaned up automatically).
