# From Drizzle

Shows how to bring your own existing Drizzle instance using `storium.fromDrizzle()` instead of `storium.connect()`.

## What it demonstrates

- Wrapping an existing Drizzle connection with `storium.fromDrizzle(drizzleDb)`
- Auto-detection of dialect from the Drizzle instance type
- `defineStore()` with column annotations on top of native Drizzle tables
- Custom queries alongside the brought-your-own connection
- Using raw Drizzle queries alongside Storium stores

## Install and run

```bash
npm install
npm start
```

Uses libsql (Turso-compatible SQLite) with a local file database. No external server required.
