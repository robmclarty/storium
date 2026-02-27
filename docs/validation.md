# Validation

Storium has three validation tiers, each serving a different layer of your stack. They're all derived from the same column definitions — you define once, and each tier gets what it needs.

## The Three Tiers

| Tier | What | When | How |
|------|------|------|-----|
| **JSON Schema** | Structural validation (types, required fields, maxLength) | HTTP edge (Fastify/Ajv, OpenAPI) | `createSchema.toJsonSchema()` |
| **Zod** | Runtime type checking + transforms + custom validation | Application layer, form validation, tRPC | `createSchema.zod` / `createSchema.validate()` |
| **Prep pipeline** | Filter → transform → validate → required | Every CRUD write (`create`, `update`) | Runs automatically |

JSON Schema is fast and stateless — great for rejecting bad requests before they hit your business logic. Zod adds transforms and custom validation. The prep pipeline is the innermost guard, running on every write even if the outer tiers are bypassed.

## Prep Pipeline

The prep pipeline runs automatically on `create()` and `update()`. It has four stages:

### Stage 0: Promise Resolution

If any input values are Promises (e.g., from `ref()`), they're resolved concurrently before the pipeline proceeds:

```typescript
await posts.create({
  title: 'Hello',
  author_id: authors.ref({ email: 'alice@example.com' }), // Promise — resolved automatically
})
```

### Stage 1: Filter

Unknown keys are stripped silently. If `onlyMutables` is true (the default for `update`), non-mutable columns are also removed.

```typescript
await users.create({ email: 'alice@example.com', unknown_field: 'ignored' })
// unknown_field is silently dropped
```

### Stage 2: Transform

Each column's `transform` callback runs on its value. Transforms run before validation — sanitize first, then check:

```typescript
email: {
  type: 'varchar', maxLength: 255, mutable: true, required: true,
  transform: (v) => String(v).trim().toLowerCase(),
}
```

Transforms can be async:

```typescript
password: {
  type: 'varchar', maxLength: 255, mutable: true, required: true, writeOnly: true,
  transform: async (v) => await bcrypt.hash(v, 10),
}
```

### Stage 3: Validate

Two checks happen here:

1. **Type checking** — the value's JavaScript type is checked against the DSL type (e.g., `varchar` expects a string, `integer` expects a number). Mismatches produce a `ValidationError`.

2. **Custom `validate` callbacks** — your column's `validate` function runs, receiving the value and a `test()` function. Errors are accumulated (not thrown one at a time).

```typescript
slug: {
  type: 'varchar', maxLength: 100, mutable: true, required: true,
  transform: (v) => String(v).trim().toLowerCase().replace(/\s+/g, '-'),
  validate: (v, test) => {
    test(v, 'not_empty', 'Slug cannot be empty')
    test(v, 'is_slug', 'Must be lowercase letters, numbers, and hyphens')
  },
}
```

### Stage 4: Required

If `validateRequired` is true (the default for `create`), columns with `required: true` are checked for defined, non-null values. Missing required fields produce a `ValidationError`.

### Pipeline Options

| Option | Default (create) | Default (update) | Description |
|--------|-------------------|-------------------|-------------|
| `force` | `false` | `false` | Skip entire pipeline — pass input through raw. |
| `validateRequired` | `true` | `false` | Enforce required field checks. |
| `onlyMutables` | `false` | `true` | Strip non-mutable columns from input. |

## The `test()` Function

The `test()` function is passed into `validate` callbacks. It supports three assertion modes:

### Named Assertions (built-in or custom)

```typescript
validate: (v, test) => {
  test(v, 'is_email', 'Must be a valid email')
  test(v, 'not_empty')
}
```

### Inline Function Assertions

```typescript
validate: (v, test) => {
  test(v, (val) => val.length <= 100, 'Too long')
  test(v, (val) => val.startsWith('/'), 'Must start with /')
}
```

### Custom Error Messages

```typescript
// String — replaces the default message
test(v, 'is_email', 'Please enter a valid email address')

// Callback — receives the default message
test(v, 'is_email', (defaultMsg) => `Registration failed: ${defaultMsg}`)

// Omitted — uses the default ("field failed 'assertion' check")
test(v, 'is_email')
```

Errors from `test()` are **accumulated**, not thrown immediately. All validation errors across all fields are collected into a single `ValidationError` with an `.errors` array.

## Built-in Assertions

These are always available without registration:

| Name | Checks |
|------|--------|
| `is_email` | Basic email format (not RFC-exhaustive). |
| `is_url` | Starts with `http://`, `https://`, or `//`. |
| `is_numeric` | A number, or a string that parses as a number. |
| `is_uuid` | UUID v4/v7 format. |
| `is_boolean` | `typeof value === 'boolean'`. |
| `is_integer` | `Number.isInteger(value)`. |
| `not_empty` | Rejects `''`, `null`, `undefined`, and whitespace-only strings. |

## Custom Assertions

Register custom assertions in your `connect()` config. They're available to all stores:

```typescript
const db = storium.connect({
  dialect: 'postgresql',
  url: process.env.DATABASE_URL,
  assertions: {
    is_slug: (v) => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
    is_hex_color: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
    is_positive: (v) => typeof v === 'number' && v > 0,
  },
})
```

Then use them by name in `validate` callbacks:

```typescript
slug: {
  type: 'varchar', maxLength: 100, mutable: true, required: true,
  validate: (v, test) => {
    test(v, 'is_slug', 'Slug must be lowercase letters, numbers, and hyphens')
  },
}

theme_color: {
  type: 'varchar', maxLength: 7, mutable: true,
  validate: (v, test) => {
    test(v, 'is_hex_color', 'Must be a hex color like #ff0000')
  },
}
```

Custom assertions override built-ins if names collide. An assertion function receives a value and returns `true` (valid) or `false` (invalid):

```typescript
type AssertionFn = (value: unknown) => boolean
```

## Runtime Schemas

Every store exposes a `schemas` object with four `RuntimeSchema` variants:

```typescript
const { createSchema, updateSchema, selectSchema, fullSchema } = users.schemas
```

| Schema | Includes | Required fields | Use case |
|--------|----------|-----------------|----------|
| `createSchema` | Insertable columns | `required: true` columns | Validating create input |
| `updateSchema` | Mutable columns | None (all optional) | Validating update input |
| `selectSchema` | Selectable columns | `notNull` columns | Validating query results |
| `fullSchema` | All columns | `notNull` columns | Internal / testing |

Each RuntimeSchema has four methods:

```typescript
// Throws ValidationError on failure, returns typed data on success
const user = createSchema.validate(input)

// Never throws — returns { success, data?, errors? }
const result = createSchema.tryValidate(input)

// Generate JSON Schema object (for Fastify, Ajv, OpenAPI)
const jsonSchema = createSchema.toJsonSchema()
const permissive = createSchema.toJsonSchema({ additionalProperties: true })

// Escape hatch to the underlying Zod schema
const extended = createSchema.zod.extend({ invite_code: z.string() })
```

## Handling Validation Errors

```typescript
import { ValidationError } from 'storium'

try {
  await users.create({ email: '', name: 123 })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.errors)
    // [
    //   { field: 'email', message: 'Email cannot be empty' },
    //   { field: 'name', message: 'name must be a String' },
    // ]
  }
}
```

The `.errors` array contains all field-level errors — multiple problems are reported in a single throw, not one at a time.

## Bypassing Validation

Pass `{ force: true }` to skip the entire prep pipeline:

```typescript
// Skip all validation, transforms, and required checks
await users.create({ id: 'custom', email: 'raw' }, { force: true })
```

Use this for seeding, migrations, or internal operations where you trust the input.
