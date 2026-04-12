# Basic

The simplest path to a working Storium store. Covers core CRUD operations, column annotations, validation, transactions, and runtime schemas — all in-memory with no database setup.

## What it demonstrates

- Native Drizzle table definition with `sqliteTable`
- `db.defineStore()` with column annotations (`required`, `hidden`, `readonly`, `transform`, `validate`)
- CRUD: `create`, `findById`, `findAll`, `findOne`, `update`, `destroy`
- Built-in assertions (`is_email`, `not_empty`)
- Transactions
- Runtime schemas (`toJsonSchema()`, `tryValidate()`)

## Install and run

```bash
npm install
npm start
```

Uses an in-memory SQLite database — no external database required.
