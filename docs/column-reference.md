# Column Reference

Quick-scan reference for all 13 DSL column types, their per-dialect SQL mappings, runtime types, and supported metadata.

## DSL Types

| DSL Type | TypeScript | PostgreSQL | MySQL | SQLite | Zod | JSON Schema |
|----------|-----------|------------|-------|--------|-----|-------------|
| `uuid` | `string` | `uuid` | `varchar(36)` | `text` | `z.string().uuid()` | `{ type: 'string', format: 'uuid' }` |
| `varchar` | `string` | `varchar(n)` | `varchar(n)` | `text` | `z.string().max(n)` | `{ type: 'string', maxLength: n }` |
| `text` | `string` | `text` | `text` | `text` | `z.string()` | `{ type: 'string' }` |
| `integer` | `number` | `integer` | `int` | `integer` | `z.number().int()` | `{ type: 'integer' }` |
| `bigint` | `bigint` | `bigint` | `bigint` | `integer({ mode: 'bigint' })` | `z.bigint()` | `{ type: 'string', format: 'int64' }` |
| `serial` | `number` | `serial` | `serial` | `integer` | `z.number().int()` | `{ type: 'integer' }` |
| `real` | `number` | `real` | `float` | `real` | `z.number()` | `{ type: 'number' }` |
| `numeric` | `number` | `numeric` | `decimal` | `real` | `z.number()` | `{ type: 'number' }` |
| `boolean` | `boolean` | `boolean` | `boolean` | `integer({ mode: 'boolean' })` | `z.boolean()` | `{ type: 'boolean' }` |
| `timestamp` | `Date` | `timestamp` | `timestamp` | `text` | `z.coerce.date()` | `{ type: 'string', format: 'date-time' }` |
| `date` | `Date` | `date` | `date` | `text` | `z.coerce.date()` | `{ type: 'string', format: 'date' }` |
| `jsonb` | `Record<string, unknown>` | `jsonb` | `json` | `text({ mode: 'json' })` | `z.record(z.string(), z.unknown())` | `{ type: 'object' }` |
| `array` | `unknown[]` | native array | `json` | `text({ mode: 'json' })` | `z.array(...)` | `{ type: 'array', items: ... }` |

## Column Metadata

Every column (DSL or raw) can use these properties:

| Property | Type | Description |
|----------|------|-------------|
| `type` | `DslType` | The DSL type string (DSL columns only). |
| `primaryKey` | `boolean` | Mark as the table's primary key. |
| `notNull` | `boolean` | Add a NOT NULL constraint. |
| `maxLength` | `number` | For `varchar` — sets max character length. |
| `default` | `'now'` \| `'uuid:v4'` \| literal | Default value. `'now'` = current timestamp, `'uuid:v4'` = auto-generated UUID. |
| `readonly` | `boolean` | Exclude from create AND update schemas (e.g., computed columns). `primaryKey: true` is always implicitly readonly. |
| `required` | `boolean` | Must this column be provided on create? Enforced by the prep pipeline. |
| `hidden` | `boolean` | Exclude from SELECT results (e.g., password hashes). Still writable. |
| `transform` | `(value) => value` | Sanitization function that runs before validation (can be async). |
| `validate` | `(value, test) => void` | Custom validation function using the `test()` API. |
| `custom` | `(col) => col` | Modify the auto-built Drizzle column (e.g., `.unique()`, `.references()`). |
| `raw` | `() => DrizzleColumn` | Full Drizzle escape hatch — bypasses the DSL entirely (raw columns only). |
| `items` | `DslType` | For `array` type — the element type (e.g., `'text'`, `'uuid'`). |

## Access Rules

Columns are writable by default. Three orthogonal flags control access: `required`, `readonly`, `hidden`.

| Metadata | In SELECT? | In INSERT schema? | In UPDATE schema? | Prep pipeline |
|----------|-----------|-------------------|-------------------|---------------|
| (default) | Yes | Yes (optional) | Yes (optional) | Filtered/transformed/validated |
| `required: true` | Yes | Yes (mandatory) | Yes (optional) | Full pipeline + required check on create |
| `readonly: true` | Yes | No | No | Not writable |
| `hidden: true` | No | Yes (optional) | Yes (optional) | Filtered/transformed/validated, excluded from SELECT |
| `hidden + required` | No | Yes (mandatory) | Yes (optional) | Full pipeline, excluded from SELECT |
| `primaryKey: true` | Yes | No (auto-generated) | No | Implicitly readonly |

Invalid combinations (throw `SchemaError`):
- `readonly: true` + `required: true`
- `readonly: true` + `hidden: true`

## Default Values

| Value | Behavior |
|-------|----------|
| `'now'` | PostgreSQL/MySQL: `defaultNow()`. SQLite: `sql\`(CURRENT_TIMESTAMP)\``. |
| `'uuid:v4'` | PostgreSQL: `defaultRandom()`. MySQL/SQLite: client-side `crypto.randomUUID()`. |
| Any literal | Passed to Drizzle's `.default(value)`. |

## Three Column Modes

```typescript
// DSL — 90% of cases
email: { type: 'varchar', maxLength: 255, required: true }

// DSL + custom — one Drizzle tweak on top
email: { type: 'varchar', maxLength: 255, custom: col => col.unique() }

// Raw — full Drizzle control (for types not in the DSL)
tags: { raw: () => text('tags').array().default([]) }
```

Raw columns resolve to `any` in TypeScript types and `z.any()` in Zod schemas. See [raw-columns.md](./raw-columns.md) for details.
