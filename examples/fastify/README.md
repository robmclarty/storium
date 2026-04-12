# Fastify

A REST API using Fastify with auto-generated JSON Schema validation from Storium stores.

## What it demonstrates

- `toJsonSchema()` for Fastify request body and response schema validation (compiled by Ajv)
- Full CRUD REST endpoints: `GET /tasks`, `GET /tasks/:id`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`
- DI pattern: stores decorated onto the Fastify instance
- `ValidationError` mapped to HTTP 400 responses
- Batch create with transactions
- Multi-file project structure with separate table, route, and seed files
- Programmatic migration and seeding at startup

## Project structure

```
fastify/
  entities/tasks/task.table.ts   Drizzle table definition
  routes/tasks.ts                REST route handlers
  seeds/001_tasks.ts             Seed data
  storium.config.ts              Migration config
  app.ts                         Server setup + self-test
```

## Install and run

```bash
npm install
npm start
```

Uses an in-memory SQLite database. The example starts a Fastify server, exercises all endpoints, then shuts down.
