/**
 * Storium's prep pipeline processes every create/update through four stages:
 *
 *   1. Filter    — strip unknown keys (and non-mutable keys on update)
 *   2. Transform — run column transform functions (sanitize, normalize)
 *   3. Validate  — type checks + custom validate callbacks (collects ALL errors)
 *   4. Required  — ensure required fields are present
 *
 * This example walks through each stage.
 */

import { storium, defineTable, defineStore, ValidationError } from 'storium'
import { sql } from 'drizzle-orm'

// --- Custom assertions ---
//
// Register domain-specific assertions at connect time. These become available
// alongside the built-ins (is_email, is_url, is_uuid, is_numeric, not_empty,
// is_boolean, is_integer) inside any column's validate callback.

const productsTable = defineTable('memory')('products', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: {
    type: 'varchar',
    maxLength: 100,
    mutable: true,
    required: true,
    validate: (v, test) => {
      test(v, 'not_empty', 'Product name cannot be empty')
      test(v, (val) => String(val).length >= 2, 'Product name must be at least 2 characters')
    },
  },
  slug: {
    type: 'varchar',
    maxLength: 100,
    mutable: true,
    required: true,
    // Transforms run BEFORE validation — generate a slug from the raw input.
    transform: (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-'),
    validate: (v, test) => {
      test(v, 'is_slug', 'Slug must contain only lowercase letters, numbers, and hyphens')
    },
  },
  price: {
    type: 'integer',
    mutable: true,
    required: true,
    validate: (v, test) => {
      test(v, (val) => (val as number) > 0, 'Price must be positive')
      test(v, (val) => (val as number) <= 999999, 'Price must not exceed 999999')
    },
  },
  color: {
    type: 'varchar',
    maxLength: 7,
    mutable: true,
    validate: (v, test) => {
      test(v, 'is_hex_color', 'Color must be a hex color code (e.g., #ff0000)')
    },
  },
  description: {
    type: 'text',
    mutable: true,
    // Trim whitespace from descriptions.
    transform: (v: string) => v.trim(),
  },
})

const productStore = defineStore(productsTable)

const db = storium.connect({
  dialect: 'memory',
  assertions: {
    is_slug: (v) => typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v),
    is_hex_color: (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v),
  },
})

const { products } = db.register({ products: productStore })

db.drizzle.run(sql`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    price INTEGER NOT NULL,
    color TEXT,
    description TEXT
  )
`)

// --- Stage 1: Filter (unknown keys are stripped) ---

console.log('=== Filter stage ===')
// Intentional: pass unknown keys to demonstrate that storium strips them at runtime.
// We use a plain object to bypass TypeScript's excess property checking.
const inputWithUnknownKeys = {
  name: 'Widget',
  slug: 'Widget',
  price: 999,
  this_field_does_not_exist: 'ignored',
  also_unknown: 42,
}
const widget = await products.create(inputWithUnknownKeys)
console.log('Created (unknown keys silently stripped):', widget)

// --- Stage 2: Transform (runs before validation) ---

console.log('\n=== Transform stage ===')
const gadget = await products.create({
  name: 'Gadget',
  slug: '  My Cool Gadget  ',   // transform: trim + lowercase + spaces→hyphens
  price: 2499,
  description: '   A very cool gadget.   ',  // transform: trim
})
console.log('Slug transformed:', gadget.slug)
// => "my-cool-gadget" (trimmed, lowercased, spaces replaced)
console.log('Description transformed:', JSON.stringify(gadget.description))
// => "A very cool gadget." (trimmed)

// --- Stage 3: Validate (all errors collected, not just the first) ---

console.log('\n=== Validate stage (error accumulation) ===')
try {
  await products.create({
    name: '',           // fails: not_empty + min length
    slug: '!!!',        // fails: is_slug (after transform: "!!!")
    price: -5,          // fails: must be positive
    color: 'red',       // fails: is_hex_color
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(`Caught ${err.errors.length} validation errors:`)
    for (const e of err.errors) {
      console.log(`  - ${e.field}: ${e.message}`)
    }
  }
}

// --- Stage 3: Type checking (runs before custom validators) ---

console.log('\n=== Type checking ===')
try {
  await products.create({
    name: 'Good Name',
    slug: 'good-slug',
    price: 'not a number' as any,  // type check: integer expected
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Type error:', err.errors[0]?.message)
    // => "`price` must be a integer"
  }
}

// --- Stage 4: Required fields ---

console.log('\n=== Required fields ===')
try {
  // @ts-expect-error — intentional: storium validates required fields at runtime
  await products.create({
    name: 'Only a name',
    // slug and price are missing — both are required
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(`Missing ${err.errors.length} required fields:`)
    for (const e of err.errors) {
      console.log(`  - ${e.field}: ${e.message}`)
    }
  }
}

// --- Update only validates mutable fields ---

console.log('\n=== Update validation ===')
try {
  await products.update(widget.id, {
    price: -100,  // still validated on update
  })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log('Update rejected:', err.errors[0]?.message)
  }
}

// --- force: true skips the entire pipeline ---

console.log('\n=== Force mode (skip pipeline) ===')
const forced = await products.update(widget.id, { price: -100 }, { force: true })
console.log('Force-updated (pipeline skipped):', forced)

// --- Runtime schemas (validate without touching the database) ---

console.log('\n=== Runtime schemas ===')

// tryValidate: returns { success, data?, errors? } — never throws
const good = products.schemas.insert.tryValidate({ name: 'Lamp', slug: 'lamp', price: 49 })
console.log('Valid input:', good)

const bad = products.schemas.insert.tryValidate({ name: 123, price: 'abc' })
console.log('Invalid input:', bad)

// toJsonSchema: for HTTP frameworks (Fastify, etc.)
console.log('\nJSON Schema (insert):')
console.log(JSON.stringify(products.schemas.insert.toJsonSchema(), null, 2))

// Zod escape hatch: compose with other Zod schemas
const zodSchema = products.schemas.insert.zod
// @ts-expect-error — .shape exists at runtime (ZodObject) but RuntimeSchema types it as ZodType
console.log('\nZod schema keys:', Object.keys(zodSchema.shape))

await db.disconnect()
