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

### Schema & Store DSL

| Export | Description |
|--------|-------------|
| `defineTable` | Define a table schema — 3 overloads: `(name, cols, opts)`, `(dialect)(name, cols, opts)`, `()(name, cols, opts)`. |
| `defineStore` | Bundle a table (from `defineTable`) + custom queries into a `StoreDefinition`: `defineStore(table, queries)`. |
| `isStoreDefinition(value)` | Type guard: returns `true` if the value is a `StoreDefinition`. |

### Error Classes

| Export | Description |
|--------|-------------|
| `ValidationError` | Thrown when input validation fails; carries an `errors: FieldError[]` array with all field-level failures. |
| `ConfigError` | Thrown when configuration is invalid (missing dialect, bad connection string, invalid `defineStore`/`defineTable` arguments). |
| `SchemaError` | Thrown when a schema definition is invalid (index references non-existent column, duplicate primary keys). |
| `StoreError` | Thrown when a store CRUD operation fails at runtime (e.g., `create`/`update` returned no rows, `find`/`destroyAll` called with empty filters). |

### Helpers

| Export | Description |
|--------|-------------|
| `withBelongsTo(relatedTable, foreignKey, opts)` | Generates a `findWith{Alias}` custom query that LEFT JOINs a related table. |
| `withMembers(joinTable, foreignKey, memberKey?)` | Generates `addMember`, `removeMember`, `getMembers`, `isMember`, `getMemberCount` custom queries for collection patterns. `memberKey` defaults to `'user_id'`. |
| `withCache(store, cacheAdapter, config)` | Wraps a store with cache-aside logic on configured read methods and auto-invalidation on writes. |

### Type Guards

| Export | Description |
|--------|-------------|
| `isStoreDefinition(value)` | Returns `true` if the value is a `StoreDefinition`. |
| `isRawColumn(config)` | Returns `true` if the column config is a `RawColumnConfig` (has a `raw` function). |
| `isRawIndex(config)` | Returns `true` if the index config is a `RawIndexConfig` (has a `raw` function). |

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
| `collectSchemas(patterns, cwd?)` | Import schema files matching glob patterns and extract Drizzle table objects from `TableDef`/`StoreDefinition` exports. |
| `collectDrizzleSchema(patterns, cwd?)` | Alias for `collectSchemas`; returns the schema map in the format drizzle-kit expects. |

---

## `StoriumInstance` (returned by `connect` / `fromDrizzle`)

| Property / Method | Description |
|-------------------|-------------|
| `db.drizzle` | Raw Drizzle database instance (escape hatch for direct Drizzle queries). |
| `db.zod` | The Zod namespace (`z`) — convenience accessor. |
| `db.dialect` | The active dialect string: `'postgresql'`, `'mysql'`, `'sqlite'`, or `'memory'`. |
| `db.defineTable(name, cols, opts?)` | Create a Drizzle table with `.storium` metadata, pre-bound to this instance's dialect and assertions. |
| `db.defineStore(tableDef, queries?)` | Create a live store from a table definition (simple path — no `register` step needed). |
| `db.register(storeDefs)` | Materialize a record of `StoreDefinition` objects into live stores with CRUD + query methods. |
| `db.transaction(fn)` | Execute an async function within a database transaction. |
| `db.disconnect()` | Close the database connection pool (idempotent — safe to call multiple times). |

---

## Store / Repository (returned by `db.defineStore`, `db.register`, or `createRepository`)

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
| `store.destroy(id, opts?)` | Delete a single row by primary key. |
| `store.destroyAll(filters, opts?)` | Delete all rows matching filters (requires at least one filter to prevent accidental full-table deletion). |
| `store.ref(filter, opts?)` | Look up a row by filter and return its primary key value. Throws `StoreError` if not found. |

### Store Properties

| Property | Description |
|----------|-------------|
| `store.schemas` | `SchemaSet` with `createSchema`, `updateSchema`, `selectSchema`, and `fullSchema` `RuntimeSchema` objects. |

### TableDef Properties (on Drizzle tables from `defineTable`)

Storium metadata is attached as a non-enumerable `.storium` property on the Drizzle table:

| Property | Description |
|----------|-------------|
| `table.storium.columns` | The original `ColumnsConfig` record (storium DSL definitions). |
| `table.storium.access` | Derived access sets: `selectable`, `writable`, `hidden`, `readonly`. |
| `table.storium.selectColumns` | Pre-built Drizzle column map for SELECT queries. |
| `table.storium.allColumns` | Full Drizzle column map including hidden columns. |
| `table.storium.primaryKey` | Name of the primary key column. |
| `table.storium.name` | Table name string. |
| `table.storium.schemas` | `SchemaSet` with `createSchema`, `updateSchema`, `selectSchema`, and `fullSchema` `RuntimeSchema` objects. |

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
| `StoriumConfig` | Configuration for `storium.connect()` — accepts storium inline shape or drizzle-kit config shape. |
| `FromDrizzleOptions` | Options for `storium.fromDrizzle()` — currently just `{ assertions? }`. |
| `StoriumInstance` | The instance returned by `connect` or `fromDrizzle`. |

### Column Definition

| Type | Description |
|------|-------------|
| `DslType` | Union of supported DSL type strings (`'uuid'`, `'varchar'`, `'text'`, etc.). |
| `DslColumnConfig` | DSL-managed column config with `type`, `primaryKey`, `notNull`, `maxLength`, `default`, `custom`, etc. |
| `RawColumnConfig` | Raw Drizzle column config with a `raw` function — bypasses the DSL entirely. |
| `ColumnConfig` | Union of `DslColumnConfig \| RawColumnConfig`. |
| `ColumnsConfig` | `Record<string, ColumnConfig>` — a table's column definitions. |

### Index Definition

| Type | Description |
|------|-------------|
| `DslIndexConfig` | DSL-managed index with `columns`, `unique`, `name`, `where`. |
| `RawIndexConfig` | Raw Drizzle index with a `raw` function. |
| `IndexConfig` | Union of `DslIndexConfig \| RawIndexConfig`. |
| `IndexesConfig` | `Record<string, IndexConfig>`. |

### Table & Store

| Type | Description |
|------|-------------|
| `TableDef<TColumns>` | A Drizzle table with `.storium` metadata (columns, access sets, schemas). |
| `StoriumMeta<TColumns>` | The metadata type attached to Drizzle tables via `.storium`. |
| `TableAccess` | Derived access sets: `selectable`, `writable`, `hidden`, `readonly`. |
| `TableOptions` | Options for `defineTable`: `indexes`, `constraints`, `primaryKey` (string or string[] for composite), `timestamps`. |
| `StoreDefinition<TColumns, TQueries>` | Inert DTO bundling a `TableDef` with custom queries — materialized via `db.register()`. |
| `Store<TColumns, TQueries>` | A live store: default CRUD + schemas + materialized custom queries. |
| `Repository<TTableDef, TQueries>` | Same shape as `Store`, produced by `createRepository()`. |
| `DefaultCRUD<TColumns>` | The default CRUD method signatures (`find`, `findAll`, `create`, `update`, etc.). |

### Query Context

| Type | Description |
|------|-------------|
| `RepositoryContext<T>` | Context passed to custom query functions — contains `drizzle`, `zod`, `table`, `schemas`, `prep`, and all default CRUD methods. |
| `Ctx<T>` | Shorthand alias for `RepositoryContext<T>` — use as `ctx: Ctx` in custom queries. |
| `CustomQueryFn<T>` | `(ctx: RepositoryContext<T>) => (...args) => any` — a custom query factory function. |
| `PrepOptions` | Options for CRUD operations: `force`, `validateRequired`, `onlyWritable`, `tx`, `limit`, `offset`, `orderBy`, `includeHidden`. |

### Schema & Validation

| Type | Description |
|------|-------------|
| `RuntimeSchema<T>` | Wraps a Zod schema with `validate`, `tryValidate`, `toJsonSchema`, and `zod` properties. |
| `SchemaSet<TColumns>` | `{ createSchema, updateSchema, selectSchema, fullSchema }` — typed runtime schemas derived from column definitions. |
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

### Cache

| Type | Description |
|------|-------------|
| `CacheAdapter` | Interface for cache implementations: `get`, `set`, `del`, `delPattern`. |
| `CacheMethodConfig` | Per-method cache config: `{ ttl, key: (...args) => string }`. |

### Compile-Time Type Utilities

| Type | Description |
|------|-------------|
| `ResolveColumnType<C>` | Map a single `ColumnConfig` to its TypeScript type (raw columns resolve to `any`). |
| `SelectType<TColumns>` | Derive the SELECT result type — excludes `hidden` columns. |
| `InsertType<TColumns>` | Derive the INSERT input type — `required` fields mandatory, writable fields optional. Values accept `Promise` for `ref()` ergonomics. |
| `UpdateType<TColumns>` | Derive the UPDATE input type — only writable columns (excludes `readonly`), all optional. |
| `Promisable<T>` | `T \| Promise<any>` — allows `ref()` values in insert/update input without casts. |
| `PkValue` | `string \| number \| (string \| number)[]` — primary key value for single or composite PKs. |

### Migrate Sub-Path Types

| Type | Description |
|------|-------------|
| `SeedContext` | Context passed to seed functions: `{ stores, drizzle, dialect, transaction, instance }`. |
| `SeedFn` | `(ctx: SeedContext) => Promise<void>` — a seed function. |
| `SeedModule` | A module exporting a seed function with the `__isSeed` marker. |
| `SchemaMap` | `Record<string, any>` — map of table names to Drizzle table objects. |

---

## Known Limitations

### Raw columns are `any` in type utilities

Columns defined with the `raw` escape hatch resolve to `any` in `SelectType`, `InsertType`, `UpdateType`, and `SchemaSet`. The Zod schema for a raw column is `z.any()`. This means raw columns bypass compile-time and runtime type checking. Use the `validate` callback on raw columns to add explicit runtime checks. See [raw-columns.md](./raw-columns.md) for details and patterns.
