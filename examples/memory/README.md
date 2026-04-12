# Memory

Demonstrates ephemeral in-memory SQLite databases — useful for prototyping, testing, and isolated scratch pads.

## What it demonstrates

- `dialect: 'memory'` for zero-config in-memory databases
- Multiple independent in-memory connections with full isolation
- Reusing the same Drizzle table definitions across different connections
- Complete lifecycle: setup, populate, query, disconnect

## Install and run

```bash
npm install
npm start
```

No external database required. Each connection creates a fully isolated in-memory SQLite database.
