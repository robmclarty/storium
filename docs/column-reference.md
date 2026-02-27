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
| `default` | `'now'` \| `'random_uuid'` \| literal | Default value. `'now'` = current timestamp, `'random_uuid'` = auto-generated UUID. |
| `mutable` | `boolean` | Can this column be updated after creation? Determines inclusion in update schemas. |
| `required` | `boolean` | Must this column be provided on create? Enforced by the prep pipeline. |
| `writeOnly` | `boolean` | Exclude from SELECT results (e.g., password hashes). Still writable. |
| `transform` | `(value) => value` | Sanitization function that runs before validation (can be async). |
| `validate` | `(value, test) => void` | Custom validation function using the `test()` API. |
| `custom` | `(col) => col` | Modify the auto-built Drizzle column (e.g., `.unique()`, `.references()`). |
| `raw` | `() => DrizzleColumn` | Full Drizzle escape hatch — bypasses the DSL entirely (raw columns only). |
| `items` | `DslType` | For `array` type — the element type (e.g., `'text'`, `'uuid'`). |

## Access Rules

Column metadata drives how each field behaves across the system:

| Metadata | In SELECT? | In INSERT schema? | In UPDATE schema? | Prep pipeline |
|----------|-----------|-------------------|-------------------|---------------|
| (default) | Yes | No | No | Ignored |
| `mutable: true` | Yes | Yes (optional) | Yes (optional) | Filtered/transformed/validated |
| `required: true` | Yes | Yes (mandatory) | No | Required check on create |
| `mutable + required` | Yes | Yes (mandatory) | Yes (optional) | Full pipeline |
| `writeOnly: true` | No | No | No | Invisible |
| `mutable + writeOnly` | No | Yes (optional) | No | Filtered/transformed/validated, excluded from SELECT |
| `primaryKey: true` | Yes | No (auto-generated) | No | Not writable |

## Default Values

| Value | Behavior |
|-------|----------|
| `'now'` | PostgreSQL/MySQL: `defaultNow()`. SQLite: `sql\`(CURRENT_TIMESTAMP)\``. |
| `'random_uuid'` | PostgreSQL: `defaultRandom()`. MySQL/SQLite: client-side `crypto.randomUUID()`. |
| Any literal | Passed to Drizzle's `.default(value)`. |

## Three Column Modes

```typescript
// DSL — 90% of cases
email: { type: 'varchar', maxLength: 255, mutable: true, required: true }

// DSL + custom — one Drizzle tweak on top
email: { type: 'varchar', maxLength: 255, mutable: true, custom: col => col.unique() }

// Raw — full Drizzle control (for types not in the DSL)
tags: { raw: () => text('tags').array().default([]), mutable: true }
```

Raw columns resolve to `any` in TypeScript types and `z.any()` in Zod schemas. See [raw-columns.md](./raw-columns.md) for details.
