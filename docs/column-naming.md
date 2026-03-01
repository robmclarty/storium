# Column Naming

Storium automatically maps between camelCase property names in your application code and snake_case column names in the database. You write `inStock` — the database sees `in_stock`.

## How It Works

Define columns using camelCase keys in your schema:

```typescript
const productsTable = defineTable('products', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  productName: { type: 'varchar', maxLength: 255, required: true },
  inStock: { type: 'boolean' },
  unitPrice: { type: 'integer', required: true },
})
```

Storium converts each key to snake_case for the underlying database column:

| App (camelCase) | Database (snake_case) |
|-----------------|----------------------|
| `productName` | `product_name` |
| `inStock` | `in_stock` |
| `unitPrice` | `unit_price` |
| `id` | `id` |

All CRUD operations, Zod schemas, and JSON schemas use the camelCase key. The snake_case name only appears in SQL.

## Snake_case Input Is Fine

If you prefer snake_case in your schema definitions, the conversion is idempotent — `price` stays `price`, `in_stock` stays `in_stock`:

```typescript
// Works — but camelCase is the recommended convention
const productsTable = defineTable('products', {
  unit_price: { type: 'integer' },
})
// DB column: unit_price (unchanged)
```

## Overriding with `dbName`

Use the `dbName` property to set an explicit database column name, bypassing the automatic conversion:

```typescript
const usersTable = defineTable('users', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  // App key: "email", DB column: "email_address"
  email: { type: 'varchar', maxLength: 255, dbName: 'email_address' },
  // App key: "displayName", DB column: "display_name" (auto — same as default)
  displayName: { type: 'varchar', maxLength: 100 },
})
```

`dbName` takes priority over the automatic camelCase-to-snake_case conversion. Use it when:

- A legacy database uses non-standard column names
- You want a different DB name than what `toSnakeCase` would produce
- You're mapping to an existing schema you don't control

## Timestamps

When timestamps are enabled (the default), Storium injects `createdAt` and `updatedAt` columns:

```typescript
// timestamps: true is the default — no need to specify
const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, required: true },
})
// Columns: id, title, createdAt, updatedAt
// DB columns: id, title, created_at, updated_at
```

Opt out with `{ timestamps: false }`:

```typescript
const logsTable = defineTable('logs', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  message: { type: 'text', required: true },
}, { timestamps: false })
// Columns: id, message (no timestamp columns)
```

The timestamp columns follow the same naming convention — `createdAt` in app code, `created_at` in the database.

## Raw Columns

Raw columns bypass the DSL entirely. You control the database column name directly through Drizzle's column builder:

```typescript
import { text } from 'drizzle-orm/pg-core'

const postsTable = defineTable('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  // Raw column — you specify 'tag_list' explicitly in the Drizzle builder
  tags: { raw: () => text('tag_list').array().default([]) },
})
// App key: "tags", DB column: "tag_list" (from the raw builder, not from toSnakeCase)
```

The automatic `toSnakeCase` conversion does not apply to raw columns. Whatever name you pass to the Drizzle column builder is what appears in the database.

## Summary

| Scenario | App Key | DB Column |
|----------|---------|-----------|
| camelCase DSL column | `inStock` | `in_stock` |
| snake_case DSL column | `in_stock` | `in_stock` |
| Single word | `price` | `price` |
| With `dbName` override | `email` | value of `dbName` |
| Timestamp (default) | `createdAt` | `created_at` |
| Raw column | `tags` | name in Drizzle builder |
