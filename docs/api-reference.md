# API Reference

Exhaustive list of everything exported from `storium` and `storium/migrate`.

---

## `storium` (main entry)

### Namespace

| Export | Description |
|--------|-------------|
| `storium` | Namespace object containing `connect` and `fromDrizzle`. |

### Connection

| Export | Description |
|--------|-------------|
| `storium.connect(config)` | Create a `StoriumInstance` from a `StoriumConfig` (dialect, URL, assertions, pool). |
| `storium.fromDrizzle(drizzleDb, opts?)` | Create a `StoriumInstance` from an existing Drizzle database instance; dialect is auto-detected. |

### Schema & Store

| Export | Description |
|--------|-------------|
| `defineStore(drizzleTable, config?)` | Wrap a native Drizzle table with storium metadata (annotations + custom queries). Returns a `StoreDefinition`. Chain `.queries({...})` for custom queries. |
| `isStoreDefinition(value)` | Type guard: returns `true` if the value is a `StoreDefinition`. |
| `hasMeta(table)` | Type guard: returns `true` if the Drizzle table has `.storium` metadata attached. |

### Error Classes

| Export | Description |
|--------|-------------|
| `ValidationError` | Thrown when input validation fails; carries an `errors: FieldError[]` array with all field-level failures. |
| `ConfigError` | Thrown when configuration is invalid (missing dialect, bad connection string, invalid arguments). |
| `SchemaError` | Thrown when a schema definition is invalid (e.g., conflicting column annotations). |
| `StoreError` | Thrown when a store CRUD operation fails at runtime (e.g., `create`/`update` returned no rows, `find`/`destroyAll` called with empty filters). |

### Mixins

| Export | Description |
|--------|-------------|
| `belongsTo(relatedTable, foreignKey, opts)` | Generates a `findWith{Alias}` custom query that LEFT JOINs a related table. |
| `hasMany(relatedTable, foreignKey, opts)` | Generates a `find{Alias}For` custom query returning all related rows for a parent ID. Supports `limit`, `offset`, `orderBy`, `where` opts. |
| `hasOne(relatedTable, foreignKey, opts)` | Generates a `find{Alias}For` custom query returning a single related row or `null`. Supports `where` opt. |
| `withMembers(joinTable, foreignKey, memberKey?)` | Generates `addMember`, `removeMember`, `getMembers`, `isMember`, `getMemberCount` custom queries for collection patterns. `memberKey` defaults to `'member_id'`. |
| `withPagination(store, defaults?)` | Wraps a store with a `paginate(filters, opts)` method. Returns `{ data, meta: { page, pageSize, total, totalPages } }`. Default page size: 25. |
| `withCache(store, cacheAdapter, config)` | Wraps a store with cache-aside logic on configured read methods and auto-invalidation on writes. **(Experimental)** |

### Type Guards

| Export | Description |
|--------|-------------|
| `isStoreDefinition(value)` | Returns `true` if the value is a `StoreDefinition`. |
| `hasMeta(table)` | Returns `true` if the Drizzle table has `.storium` metadata attached. |

---

## `storium/migrate` (sub-path)

Migration tooling — heavier dependencies, opt-in import.

### Migration Commands

| Export | Description |
|--------|-------------|
| `generate()` | Diff current schemas against the last migration state and generate a new migration SQL file. Auto-loads config; shells out to drizzle-kit CLI. |
| `migrate(db, config?)` | Apply all pending migrations to the database using drizzle-orm's built-in migrators. Auto-loads config if not provided. |
| `push()` | Push the current schema directly to the database without creating migration files (dev only). Auto-loads config; shells out to drizzle-kit CLI. |
| `status(config?)` | Show migration status: lists migration files and matched schema files. Auto-loads config if not provided. |
| `loadConfig(configPath?)` | Load and return the resolved `StoriumConfig` from the config file. |

### Seeds

| Export | Description |
|--------|-------------|
| `defineSeed(fn)` | Wrap a seed function with a type marker; the function receives `SeedContext` with auto-discovered stores, Drizzle instance, and more. |
| `seed(db, config?)` | Run all seed files in alphabetical order; auto-discovers stores from config globs. Stops on first failure. |

### Schema Collection

| Export | Description |
|--------|-------------|
| `collectSchemas(patterns, cwd?)` | Import schema files matching glob patterns and extract Drizzle table objects from `StoreDefinition` exports, storium-annotated tables, and raw Drizzle tables. |
| `collectDrizzleSchema(patterns, cwd?)` | Alias for `collectSchemas`; returns the schema map in the format drizzle-kit expects. |

---

## `StoriumInstance` (returned by `connect` / `fromDrizzle`)

| Property / Method | Description |
|-------------------|-------------|
| `db.drizzle` | Raw Drizzle database instance (escape hatch for direct Drizzle queries). |
| `db.zod` | The Zod namespace (`z`) — convenience accessor. |
| `db.dialect` | The active dialect string: `'postgresql'`, `'mysql'`, `'sqlite'`, or `'memory'`. |
| `db.defineStore(drizzleTable, config?)` | Create a live store from a Drizzle table (simple path — no `register` step needed). Chain `.queries({...})` for custom queries. |
| `db.register(storeDefs)` | Materialize a record of `StoreDefinition` objects into live stores with CRUD + query methods. |
| `db.transaction(fn)` | Execute an async function within a database transaction. |
| `db.disconnect()` | Close the database connection pool (idempotent — safe to call multiple times). |

---

## Store (returned by `db.defineStore`, `db.register`)

### Default CRUD Methods

| Method | Description |
|--------|-------------|
| `store.find(filters, opts?)` | Find rows matching all key-value filters (requires at least one filter; use `findAll` for no filters). |
| `store.findAll(opts?)` | Return all rows, optionally with `limit`/`offset`. |
| `store.findOne(filters, opts?)` | Find the first row matching filters, or `null` if none found. |
| `store.findById(id, opts?)` | Find a single row by primary key, or `null` if not found. |
| `store.findByIdIn(ids, opts?)` | Find all rows whose primary key is in the given array. |
| `store.create(input, opts?)` | Insert a new row; runs the prep pipeline (filter, transform, validate, required); throws `StoreError` if no row is returned. |
| `store.update(id, input, opts?)` | Update a row by primary key; only writable columns are accepted; throws `StoreError` if no row is matched. |
| `store.createMany(inputs[], opts?)` | Bulk insert multiple rows; each row passes through the prep pipeline. Returns all inserted rows. |
| `store.upsert(input, opts?)` | Insert or update on conflict. Default conflict target: primary key. Override with `opts.conflictTarget` or `StoreConfig.conflictTarget`. |
| `store.destroy(id, opts?)` | Delete a single row by primary key. |
| `store.destroyAll(filters, opts?)` | Delete all rows matching filters (requires at least one filter to prevent accidental full-table deletion). |
| `store.count(filters?, opts?)` | Count rows matching filters. Supports `where` callback. |
| `store.exists(filters, opts?)` | Check if any row matches filters. Returns `boolean`. |
| `store.ref(filter, opts?)` | Look up a row by filter and return its primary key value as a Promise. Throws `StoreError` if not found. Designed for foreign key resolution — embed directly in `create()` calls: `await posts.create({ author_id: users.ref({ email: 'alice@example.com' }) })`. The prep pipeline's Resolve stage automatically awaits the Promise. |

### Soft Delete Methods

When a store is configured with `softDelete: true` (and the Drizzle table has a `deletedAt` column), `destroy` performs a soft delete (sets `deletedAt`) and all reads automatically filter out deleted rows. These additional methods are also available:

| Method | Description |
|--------|-------------|
| `store.restore(id, opts?)` | Restore a soft-deleted row (sets `deletedAt` back to `null`). Throws `StoreError` if not found. |
| `store.forceDestroy(id, opts?)` | Permanently delete a row (actual `DELETE`), bypassing soft delete. |
| `store.forceDestroyAll(filters, opts?)` | Permanently delete all matching rows (actual `DELETE`). |
| `store.findWithDeleted(filters?, opts?)` | Find rows including soft-deleted ones (bypasses the `deletedAt IS NULL` filter). |

### Dialect Caveat: MySQL update-then-select race

PostgreSQL and SQLite support `RETURNING`, so write methods that return the
affected row (`update`, `upsert`, `restore`, `destroy`, `create`) read it back
atomically in a single statement.

MySQL has no `RETURNING` clause, so on MySQL these methods perform a separate
`UPDATE`/`INSERT` followed by a `SELECT` to fetch the row. **Between those two
statements a concurrent transaction can modify or delete the row, so the
follow-up `SELECT` may return stale data — or no row at all.**

For critical update-then-read paths on MySQL, run the operation inside a
transaction so both statements share one isolation scope:

```typescript
await db.transaction(async (tx) => {
  const updated = await users.update(id, { status: 'active' }, { tx })
  // `updated` is now read back within the same transaction — no interleaving.
})
```

This only affects MySQL; PostgreSQL and SQLite are unaffected.

### Store Properties

| Property | Description |
|----------|-------------|
| `store.name` | The table name string. |
| `store.schemas` | `SchemaSet` with `createSchema`, `updateSchema`, `selectSchema`, and `fullSchema` `RuntimeSchema` objects. |

### StoriumMeta Properties (on Drizzle tables from `defineStore`)

Storium metadata is attached as a non-enumerable `.storium` property on the Drizzle table:

| Property | Description |
|----------|-------------|
| `table.storium.annotations` | The `ColumnAnnotations` record (storium-specific per-column metadata). |
| `table.storium.access` | Derived access sets: `selectable`, `writable`, `hidden`, `readonly`. |
| `table.storium.selectColumns` | Pre-built Drizzle column map for SELECT queries. |
| `table.storium.allColumns` | Full Drizzle column map including hidden columns. |
| `table.storium.primaryKey` | Name of the primary key column (or array for composite PKs). |
| `table.storium.name` | Table name string. |
| `table.storium.schemas` | `SchemaSet` with `createSchema`, `updateSchema`, `selectSchema`, and `fullSchema` `RuntimeSchema` objects. |
| `table.storium.softDelete` | `boolean` — `true` if `softDelete: true` was set in the store config. |

---

## RuntimeSchema

Each schema variant (`createSchema`, `updateSchema`, `selectSchema`, `fullSchema`) on a `SchemaSet` exposes:

| Method | Description |
|--------|-------------|
| `schema.validate(input)` | Validate input; throws `ValidationError` on failure, returns typed data on success. |
| `schema.tryValidate(input)` | Validate without throwing; returns `{ success, data?, errors? }`. |
| `schema.toJsonSchema(opts?)` | Generate a JSON Schema object (for Fastify, Ajv, OpenAPI, etc.). |
| `schema.zod` | The underlying Zod schema for advanced composition (`.extend()`, `.pick()`, etc.). |

---

## Types

### Configuration

| Type | Description |
|------|-------------|
| `Dialect` | `'postgresql' \| 'mysql' \| 'sqlite' \| 'memory'` |
| `StoriumConfig<D>` | Configuration for `storium.connect()` — accepts storium inline shape or drizzle-kit config shape. Generic `D` preserves the literal dialect type. |
| `FromDrizzleOptions` | Options for `storium.fromDrizzle()` — currently just `{ assertions? }`. |
| `StoriumInstance<D>` | The instance returned by `connect` or `fromDrizzle`. When `D` is a specific dialect, `db.drizzle` resolves to the concrete Drizzle class. |

### Column Annotations (storium-specific metadata)

| Type | Description |
|------|-------------|
| `ColumnAnnotation` | Per-column storium metadata: `{ readonly?, hidden?, required?, transform?, validate? }`. |
| `ColumnAnnotations` | `Record<string, ColumnAnnotation>` — a table's column annotations. |
| `StoreConfig` | Second argument to `defineStore`: `{ columns?: ColumnAnnotations, softDelete?: boolean, conflictTarget?: string[] }`. |

### Table & Store

| Type | Description |
|------|-------------|
| `StoriumMeta` | The metadata type attached to Drizzle tables via `.storium`. |
| `AccessConfig` | Derived access sets: `selectable`, `writable`, `hidden`, `readonly`. |
| `StoreDefinition` | Inert DTO bundling a Drizzle table with storium metadata and custom queries — materialized via `db.register()`. |
| `Store<TTable, TQueries>` | A live store: default CRUD + schemas + materialized custom queries. |
| `InferStore<T>` | Infers `Store<TTable, TQueries>` from a `StoreDefinition` — used by `register()` to preserve type parameters. |

### Query Context

| Type | Description |
|------|-------------|
| `Ctx` | Context passed to custom query functions — contains `drizzle`, `zod`, `table`, `schemas`, `prep`, and all default CRUD methods. |
| `CustomQueryFn<D, TTable>` | `(ctx: Ctx) => (...args) => any` — a custom query factory function. |
| `QueriesConfig` | `Record<string, (ctx: any) => (...args) => any>` — constraint type for custom query records. |
| `QueryOptions<TTable>` | Options for CRUD operations: `tx`, `limit`, `offset`, `orderBy`, `where`, `conflictTarget`. |
| `OrderBySpec` | `{ column: string, direction?: 'asc' \| 'desc' }` — ordering specification. |

### Schema & Validation

| Type | Description |
|------|-------------|
| `RuntimeSchema<T>` | Wraps a Zod schema with `validate`, `tryValidate`, `toJsonSchema`, and `zod` properties. |
| `SchemaSet` | `{ createSchema, updateSchema, selectSchema, fullSchema }` — runtime schemas derived from column introspection + annotations. |
| `JsonSchema` | A plain JSON Schema object with `type`, `properties`, `required`, `additionalProperties`, `title?`, `description?`, `$id?`. |
| `JsonSchemaOptions` | Options for `toJsonSchema()`: `{ additionalProperties?, properties?, required?, title?, description?, $id? }`. |
| `FieldError` | `{ field: string, message: string }` — a single validation error entry. |
| `ValidationResult<T>` | `{ success, data?, errors? }` — result from `tryValidate()`. |

### Assertions

| Type | Description |
|------|-------------|
| `AssertionFn` | `(value: unknown) => boolean` — a named assertion function. |
| `AssertionRegistry` | `Record<string, AssertionFn>` — registry of named assertions. |
| `TestFn` | The `test(value, assertion, customError?)` function signature passed to `validate` callbacks. |
| `ValidatorTest` | A single test result entry used internally by the validation pipeline. |

### Cache

| Type | Description |
|------|-------------|
| `CacheAdapter` | Interface for cache implementations: `get`, `set`, `del`, `delPattern`. |
| `CacheMethodConfig` | Per-method cache config: `{ ttl, key: (...args) => string }`. |

### Pagination

| Type | Description |
|------|-------------|
| `PaginateOptions` | Options for `paginate()`: `{ page, pageSize?, orderBy?, where?, tx?, includeHidden? }`. |
| `PaginateResult<T>` | Return type of `paginate()`: `{ data: T[], meta: { page, pageSize, total, totalPages } }`. |

### Utility

| Type | Description |
|------|-------------|
| `PkValue` | `string \| number \| (string \| number)[]` — primary key value for single or composite PKs. |
| `Promisable<T>` | `T \| Promise<any>` — allows `ref()` values in insert/update input without casts. |
