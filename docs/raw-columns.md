# Raw Columns

Most columns should be defined with the Storium DSL (`type: 'varchar'`, `type: 'jsonb'`, etc.). The DSL handles Drizzle column construction, Zod schema generation, and the prep pipeline automatically.

For database-specific types that aren't in the DSL — `text[]` arrays, `tsvector`, PostGIS `geometry`, custom enums, etc. — use the `raw` escape hatch.

## Syntax

```typescript
const posts = defineTable('postgresql')('posts', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },

  // Raw column: PostgreSQL text array
  tags: {
    raw: () => text('tags').array().default([]),
    mutable: true,
  },
})
```

The `raw` key takes a zero-argument function that returns a Drizzle column builder. All other `BaseColumnMeta` properties (`mutable`, `writeOnly`, `required`, `transform`, `validate`) still apply.

## What You Lose

Raw columns receive **no Storium-level type checking**. The generated Zod schema for a raw column is `z.any()` — it accepts any value without error.

This means:
- The prep pipeline's validate stage does not check the value's type.
- `maxLength` is not applicable (it's a DSL-only option).
- JSON Schema output will use `{}` (permissive) for the field.

The database itself will still enforce its own constraints (e.g., Postgres will reject a non-array value for a `text[]` column), but the error will come from the driver, not a clean `ValidationError`.

## Adding Validation to Raw Columns

Use the `validate` callback to add explicit checks:

```typescript
tags: {
  raw: () => text('tags').array().default([]),
  mutable: true,
  validate: (value, test) => {
    test(value, (v) => Array.isArray(v), 'tags must be an array')
    test(value, (v) => (v as any[]).every(t => typeof t === 'string'), 'tags must be strings')
  },
},
```

The `test()` function works identically for raw and DSL columns. Custom assertions registered in `connect({ assertions: { ... } })` are also available.

## Using `ctx.drizzle` for Raw Query Building

When writing custom queries that involve raw column types, use `ctx.drizzle` with Drizzle's SQL template tag:

```typescript
import { sql } from 'drizzle-orm'

const posts = db.defineStore('posts', columns, {
  queries: {
    findByTag: (ctx) => async (tag: string) => {
      return ctx.drizzle
        .select(ctx.selectColumns)
        .from(ctx.table)
        .where(sql`${tag} = ANY(${ctx.table.tags})`)
    },

    addTag: (ctx) => async (id: string, tag: string) => {
      return ctx.drizzle
        .update(ctx.table)
        .set({ tags: sql`array_append(tags, ${tag})` })
        .where(eq(ctx.table.id, id))
        .returning(ctx.selectColumns)
        .then(rows => rows[0])
    },
  },
})
```

## Common Raw Column Patterns

### PostgreSQL text array

```typescript
tags: { raw: () => text('tags').array().default([]), mutable: true }
```

### PostgreSQL JSONB with specific shape

```typescript
// For JSONB with a known shape, use the DSL type 'jsonb' — it's a first-class DSL type.
// Raw is only needed if you want Postgres-specific options like notNull with a complex default.
settings: {
  raw: () => jsonb('settings').notNull().default({ theme: 'light', notifications: true }),
  mutable: true,
}
```

### PostgreSQL tsvector (full-text search)

```typescript
import { customType } from 'drizzle-orm/pg-core'

const tsvector = customType<{ data: string }>({
  dataType() { return 'tsvector' },
})

search_vector: {
  raw: () => tsvector('search_vector'),
  writeOnly: true, // populated by a trigger; never returned in SELECT
}
```

### PostgreSQL enum

```typescript
import { pgEnum } from 'drizzle-orm/pg-core'

export const statusEnum = pgEnum('status', ['draft', 'published', 'archived'])

status: {
  raw: () => statusEnum('status').default('draft'),
  mutable: true,
  validate: (value, test) => {
    test(value, (v) => ['draft', 'published', 'archived'].includes(v as string), 'invalid status')
  },
}
```

## Dialect Portability

Raw columns are inherently dialect-specific. A `text('tags').array()` column is PostgreSQL-only and will fail to migrate on MySQL or SQLite. If you're building a multi-dialect library or application, wrap raw columns in dialect-specific schema files rather than using them in shared definitions.
