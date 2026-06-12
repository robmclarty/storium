/**
 * @module types
 *
 * This module defines all shared TypeScript types for the Storium library.
 * It includes column annotation types, table definition types, repository types,
 * runtime schema types, and compile-time generic type utilities.
 */

import type { SQL, Table, InferSelectModel, InferInsertModel } from 'drizzle-orm'
import type { ZodType, z as ZodNamespace } from 'zod'
import type { PgDatabase, PgTable } from 'drizzle-orm/pg-core'
import type { MySqlDatabase, MySqlTable } from 'drizzle-orm/mysql-core'
import type { BaseSQLiteDatabase, SQLiteTable } from 'drizzle-orm/sqlite-core'

// ---------------------------------------------------------------- Dialect --

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'memory'

// -------------------------------------------------------- Drizzle Database --

/**
 * Maps a Storium dialect to its Drizzle database type.
 * When `D` is a specific dialect literal, resolves to the concrete Drizzle class.
 * When `D` is the full `Dialect` union (the default), resolves to `any` so that
 * dialect-agnostic code (helpers, custom queries) can call
 * methods like `.select()` and `.run()` without narrowing first.
 *
 * Imported from the `drizzle-orm` peer dep (type-only, zero runtime coupling).
 */
export type DrizzleDatabase<D extends Dialect = Dialect> =
  [D] extends [Dialect]
    ? Dialect extends D
      ? any  // D is the full union — fall back to any for usability
      : D extends 'postgresql' ? PgDatabase<any, any, any>
      : D extends 'mysql' ? MySqlDatabase<any, any, any, any>
      : D extends 'sqlite' | 'memory' ? BaseSQLiteDatabase<any, any, any, any>
      : any
    : any

/**
 * Infer the Storium dialect from a Drizzle database type.
 * Used by `fromDrizzle()` to auto-detect dialect at the type level.
 */
export type InferDialect<DB> =
  DB extends PgDatabase<any, any, any> ? 'postgresql' :
  DB extends MySqlDatabase<any, any, any, any> ? 'mysql' :
  DB extends BaseSQLiteDatabase<any, any, any, any> ? 'sqlite' :
  Dialect

/**
 * Infer the Storium dialect from a Drizzle *table* type. A `pgTable` can only
 * run against a PostgreSQL connection, so the table flavor pins the dialect.
 *
 * Used by the multi-file `defineStore().queries()` pattern, where the store
 * definition is inert (no connection yet) — the table type is the only dialect
 * signal available, and it's enough to give custom queries a concrete
 * `ctx.drizzle` and typed CRUD. When `TTable` is the base `Table`, falls back
 * to the full `Dialect` union (which resolves `ctx.drizzle` to `any`).
 *
 * Note: SQLite tables resolve to `'sqlite' | 'memory'` — both map to the same
 * Drizzle database class, so `ctx.drizzle` is `BaseSQLiteDatabase` either way.
 */
export type InferTableDialect<TTable extends Table> =
  TTable extends PgTable ? 'postgresql' :
  TTable extends MySqlTable ? 'mysql' :
  TTable extends SQLiteTable ? 'sqlite' | 'memory' :
  Dialect

// --------------------------------------------------------- Drizzle Column --

/**
 * Minimal shape of a Drizzle column object at runtime.
 * We only declare what we actually read — no coupling to Drizzle internals.
 */
export type DrizzleColumn = {
  name: string
  dataType: string
  columnType: string
  notNull: boolean
  hasDefault: boolean
  primary: boolean
  isUnique: boolean
  enumValues?: string[]
  length?: number
  /** Array columns expose their base column type. */
  baseColumn?: DrizzleColumn
  [key: string]: any
}

// --------------------------------------------------------- Row Type Utilities --

/**
 * Infer the SELECT row type from a Drizzle table.
 * When TTable is the base `Table` type (no specific table), falls back to `any`.
 */
type InferRow<TTable extends Table = Table> =
  Table extends TTable ? any : InferSelectModel<TTable>

/**
 * The public SELECT row: the inferred row with `hidden` columns omitted.
 * `THidden` is the union of hidden column-name literals captured from the store
 * config (see `HiddenKeys`). Defaults to `never`, so `Omit<…, never>` is the
 * full row and non-hidden stores are unaffected. Preserves the `any` fallback
 * for the base `Table` type (so `Omit<any, never>` never leaks an index-signature
 * object in its place).
 */
type PublicRow<TTable extends Table = Table, THidden extends string = never> =
  Table extends TTable ? any : Omit<InferSelectModel<TTable>, THidden>

/**
 * Infer the INSERT input type from a Drizzle table.
 * When TTable is the base `Table` type (no specific table), falls back to `Record<string, any>`.
 */
type InferInput<TTable extends Table = Table> =
  Table extends TTable ? Record<string, any> : InferInsertModel<TTable>

// ------------------------------------------------------------- Assertions --

/** A named assertion function: receives a value, returns true if valid. */
export type AssertionFn = (value: unknown) => boolean

/** Registry of named assertions (built-in + user-defined). */
export type AssertionRegistry = Record<string, AssertionFn>

/**
 * The `test()` function signature passed into `validate` callbacks.
 *
 * @param value - The value being tested
 * @param assertion - A built-in/registered string name, or a function returning true if valid
 * @param customError - Optional: string message, or callback that receives the default message
 *                      and returns the final error string
 */
export type TestFn = (
  value: unknown,
  assertion: string | ((value: unknown) => boolean),
  customError?: string | ((defaultMessage: string) => string)
) => void

/** Consumer-friendly alias for the `test` function signature in `validate` callbacks. */
export type ValidatorTest = TestFn

// ------------------------------------------------- Column Annotations --

/**
 * Storium-specific column annotation. These are metadata properties that
 * Drizzle does not provide — validation, access control, and transforms.
 * Annotations are optional; columns without annotations still get
 * auto-generated Zod/JSON Schema from Drizzle column introspection.
 */
export type ColumnAnnotation = {
  /** Exclude from write operations (create + update). Always true for primaryKey columns. */
  readonly?: boolean
  /** Exclude from SELECT results. Implies writable (e.g., password hashes). */
  hidden?: boolean
  /** Must be provided on create. */
  required?: boolean
  transform?: (value: unknown) => unknown | Promise<unknown>
  validate?: (value: unknown, test: TestFn) => void
}

/** A record of column names to their annotations. */
export type ColumnAnnotations = Record<string, ColumnAnnotation>

// ----------------------------------------------------------- Store Config --

/**
 * Configuration for `defineStore()`. Contains storium-specific metadata
 * to layer on top of a raw Drizzle table.
 *
 * Generic over `TTable` — when a specific Drizzle table type is provided, the
 * `columns` keys are constrained to that table's column names, so unknown keys
 * (typos) fail at compile time and editors autocomplete valid columns. When
 * `TTable` is the base `Table` (default), falls back to the untyped
 * `ColumnAnnotations` record. `validateAnnotations()` remains the runtime backstop.
 */
export type StoreConfig<TTable extends Table = Table> = {
  /** Per-column annotations (validation, access control, transforms). */
  columns?: Table extends TTable
    ? ColumnAnnotations
    : { [K in keyof TTable['_']['columns']]?: ColumnAnnotation }
  /** Enable soft delete. The Drizzle table must have a `deletedAt` column. */
  softDelete?: boolean
  /**
   * Default columns to target for conflict detection in `upsert()`. Overridden
   * by per-call `opts.conflictTarget`.
   *
   * `readonly` so the config survives `const`-capture (which infers array
   * literals as `readonly` tuples) — see `HiddenKeys` / `defineStore`.
   */
  conflictTarget?: readonly string[]
}

/**
 * Extract the column names marked `hidden: true` from a (literally-captured)
 * store config, as a string-literal union. Used to `Omit` hidden columns from
 * public row types. Resolves to `never` when the config has no `columns` or no
 * hidden columns (so the `Omit` is a no-op). Requires the config to be captured
 * with a `const` type parameter, otherwise `hidden: true` widens to `boolean`
 * and nothing is matched.
 */
export type HiddenKeys<TConfig> =
  TConfig extends { columns: infer C }
    ? { [K in keyof C]: C[K] extends { hidden: true } ? K : never }[keyof C] & string
    : never

// ----------------------------------------------------------- Table Access --

/** Derived access sets for a table. */
export type TableAccess = {
  /** Columns included in SELECT (all except hidden). */
  selectable: string[]
  /** Columns allowed in CREATE/UPDATE input (all except readonly/primaryKey). */
  writable: string[]
  /** Columns excluded from SELECT (hidden). */
  hidden: string[]
  /** Columns excluded from CREATE/UPDATE (readonly + primaryKey). */
  readonly: string[]
}

/**
 * Table-level access overrides: union with per-column hidden/readonly.
 */
export type AccessConfig = {
  hidden?: string[]
  readonly?: string[]
}

// --------------------------------------------------------- Runtime Schema --

/** A single validation error entry. */
export type FieldError = {
  field: string
  message: string
}

/** Result from `tryValidate()` — never throws. */
export type ValidationResult<T = any> = {
  success: boolean
  data?: T
  errors?: FieldError[]
}

/** Options for `toJsonSchema()`. */
export type JsonSchemaOptions = {
  /** Allow properties not defined in the schema (default: false). */
  additionalProperties?: boolean
  /** Extra properties to merge into the generated schema. */
  properties?: Record<string, any>
  /** Extra required field names to append to the generated required array. */
  required?: string[]
  /** Schema title (for OpenAPI / Swagger). */
  title?: string
  /** Schema description (for OpenAPI / Swagger). */
  description?: string
  /** Schema $id (for Fastify shared schemas via `fastify.addSchema()`). */
  $id?: string
}

/** A plain JSON Schema object. */
export type JsonSchema = {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
  additionalProperties?: boolean
  title?: string
  description?: string
  $id?: string
}

/**
 * RuntimeSchema wraps a Zod schema with Storium-flavored methods.
 * Available for select, insert, update, and full schema variants.
 */
export type RuntimeSchema<T = any> = {
  /** Validate input. Throws `ValidationError` on failure. Returns typed data on success. */
  validate: (input: unknown) => T
  /** Validate input without throwing. Returns a result object. */
  tryValidate: (input: unknown) => ValidationResult<T>
  /** Generate a JSON Schema object (for Fastify/Ajv or other consumers). */
  toJsonSchema: (opts?: JsonSchemaOptions) => JsonSchema
  /** The underlying Zod schema for advanced composition. */
  zod: ZodType<T>
}

/**
 * The full set of runtime schemas derived from a table definition.
 *
 * Generic over `TTable` — when a specific Drizzle table type is provided,
 * `validate()`/`tryValidate()` return the inferred row/insert types instead of
 * `any`. When `TTable` is the base `Table` (default), falls back to `any`.
 *
 * These types are approximate: Zod transforms applied via column annotations
 * can change the validated shape. They are a strong default, not a guarantee.
 */
export type SchemaSet<TTable extends Table = Table> = {
  selectSchema: RuntimeSchema<InferRow<TTable>>
  createSchema: RuntimeSchema<InferInput<TTable>>
  updateSchema: RuntimeSchema<Partial<InferInput<TTable>>>
  fullSchema: RuntimeSchema<InferRow<TTable>>
}

// ------------------------------------------------------------ StoriumMeta --

/**
 * Storium metadata attached to every Drizzle table via `defineStore()`.
 * Accessed via `table.storium.annotations`, `table.storium.schemas`, etc.
 */
export type StoriumMeta = {
  /** Per-column storium annotations (hidden, readonly, required, validate, transform). */
  annotations: ColumnAnnotations
  /** Derived access sets for the table. */
  access: TableAccess
  /** Pre-built column map for SELECT (excludes hidden). */
  selectColumns: Record<string, any>
  /** Full column map including hidden columns. */
  allColumns: Record<string, any>
  /** Primary key column(s). String for single PK, array for composite. */
  primaryKey: string | string[] | undefined
  /** Table name. */
  name: string
  /** Runtime schemas (Zod + JSON Schema). */
  schemas: SchemaSet
  /** Whether this table uses soft delete. */
  softDelete: boolean
  /** Default conflict target columns for upsert (undefined when unset). */
  conflictTarget: readonly string[] | undefined
}

// ------------------------------------------------------------ Table Def --

/**
 * A table definition: a Drizzle table object with storium metadata
 * attached as a non-enumerable `.storium` property.
 *
 * Produced by `defineStore()` when building a StoreDefinition.
 * Compatible with drizzle-kit (which sees a real Drizzle table) and
 * storium (which reads `table.storium.*`).
 */
export type TableDef = {
  /** Storium metadata (annotations, access sets, schemas, etc.). */
  storium: StoriumMeta
  /** Drizzle column access — any property is a Drizzle column. */
  [key: string]: any
}

// ----------------------------------------------------------- Prep Options --

/** A single orderBy directive: column name + direction. */
export type OrderBySpec = {
  column: string
  direction?: 'asc' | 'desc'
}

/**
 * Public query options available to application code calling store methods.
 * Does not include escape hatches like `skipPrep` or `includeHidden` —
 * those are only available inside custom queries via `PrepOptions`.
 */
export type QueryOptions<TTable = any> = {
  /** Participate in an external transaction. */
  tx?: any
  /** Limit the number of rows returned (find, findAll). */
  limit?: number
  /** Skip this many rows before returning results (find, findAll). */
  offset?: number
  /**
   * Sort results. Accepts a single spec or array of specs.
   * Each spec is `{ column, direction }` where direction defaults to `'asc'`.
   */
  orderBy?: OrderBySpec | OrderBySpec[]
  /**
   * Additional Drizzle WHERE clause. Receives the table for column references.
   * AND'd with any equality filters from `find()`.
   */
  where?: (table: TTable) => SQL | undefined
  /**
   * Columns to target for conflict detection in `upsert()`.
   * Defaults to the primary key. Pass column names for unique constraint targets.
   */
  conflictTarget?: string[]
}

/**
 * Extended options with escape hatches for the prep pipeline.
 * Available inside custom queries via `ctx` methods. The public Store API uses `QueryOptions`.
 *
 * Generic over `TTable` so the `where` callback (inherited from `QueryOptions`)
 * receives the typed table inside ctx CRUD calls. Defaults to `any`.
 */
export type PrepOptions<TTable = any> = QueryOptions<TTable> & {
  /** Skip the entire prep pipeline and pass input through unprocessed. Default: false. */
  skipPrep?: boolean
  /** Enforce required fields. Default: true for create, false for update. */
  validateRequired?: boolean
  /** Strip non-writable keys from input. Default: false for create, true for update. */
  onlyWritable?: boolean
  /**
   * Include hidden columns in the result. Default: false.
   * Use this for specific operations that need sensitive data (e.g. password
   * hash comparison during authentication). Only available inside custom queries.
   */
  includeHidden?: boolean
}

/** A primary key value: single column or composite (array of values in PK column order). */
export type PkValue = string | number | (string | number)[]

// ------------------------------------------------------- Repository / Store --

/**
 * The context object passed to custom query functions.
 * Contains the database handle, table metadata, default CRUD operations,
 * and the prep pipeline.
 */
export type RepositoryContext<
  D extends Dialect = Dialect,
  TTable extends Table = Table,
  TSoftDelete extends boolean = false,
> = {
  /**
   * The Drizzle database instance (escape hatch).
   * When `D` is a specific dialect, resolves to the concrete Drizzle class
   * with full autocomplete. Falls back to the union when dialect is unknown.
   */
  drizzle: DrizzleDatabase<D>
  /** The Zod namespace (convenience accessor matching ctx.drizzle). */
  zod: typeof ZodNamespace
  /** The active dialect. */
  dialect: D
  /**
   * The Drizzle table object with `.storium` metadata.
   * When `TTable` is a specific table, exposes typed columns (`ctx.table.email`).
   * When `TTable` is the base `Table` (e.g. a standalone `Ctx`-typed query file),
   * falls back to `TableDef` so dynamic column access stays ergonomic.
   */
  table: Table extends TTable ? TableDef : TTable & { storium: StoriumMeta }
  /** Pre-built column map for select() (excludes hidden columns). */
  selectColumns: Record<string, any>
  /** Full column map including hidden columns. */
  allColumns: Record<string, any>
  /** Primary key column name(s). String for single PK, array for composite. */
  primaryKey: string | string[]
  /** Runtime schemas. */
  schemas: SchemaSet<TTable>
  /** The filter → transform → validate pipeline. */
  prep: (input: Record<string, any>, opts?: PrepOptions<TTable>) => Promise<Record<string, any>>
} & DefaultCRUD<TTable, PrepOptions<TTable>>
  & (TSoftDelete extends true ? SoftDeleteCRUD<TTable, PrepOptions<TTable>> : {})

/**
 * Shorthand for `RepositoryContext` — the context object passed to custom
 * query factories.
 */
export type Ctx<
  D extends Dialect = Dialect,
  TTable extends Table = Table,
  TSoftDelete extends boolean = false,
> = RepositoryContext<D, TTable, TSoftDelete>

/**
 * A custom query function receives the repository context and returns
 * the actual query function. This enables closure over `ctx` and
 * composition with default CRUD operations.
 */
export type CustomQueryFn<
  D extends Dialect = Dialect,
  TTable extends Table = Table,
  TSoftDelete extends boolean = false,
> = (ctx: RepositoryContext<D, TTable, TSoftDelete>) => (...args: any[]) => any

/**
 * Constraint type for custom query function records.
 * Each entry is a factory: receives ctx, returns the actual query function.
 *
 * @remarks `ctx: any` is intentional — user-defined query factories have
 * arbitrary signatures and may compose mixins from different modules.
 * Typing ctx here would create circular imports between types.ts and
 * the mixin modules. The typed `RepositoryContext<D>` alias exists for
 * consumers who want narrower typing on individual queries.
 */
export type QueriesConfig = Record<string, (ctx: any) => (...args: any[]) => any>

/**
 * Default CRUD operations present on every store/repository.
 *
 * Generic over `TTable` — when a specific Drizzle table type is provided,
 * row return types narrow to `PublicRow<TTable, THidden>` (the inferred row with
 * any `hidden` columns omitted) and input types narrow to `InferInsertModel`.
 * When `TTable` is the base `Table` (default), falls back to `any` /
 * `Record<string, any>` for backward compatibility.
 *
 * `THidden` is the union of hidden column-name literals; it defaults to `never`,
 * so a store with no hidden columns is unaffected. Inputs are **not** omitted —
 * `hidden: true` implies writable, so create/update still accept hidden columns;
 * only the returned rows strip them.
 */
type DefaultCRUD<TTable extends Table = Table, TOpts = QueryOptions<TTable>, THidden extends string = never> = {
  find: (filters: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<PublicRow<TTable, THidden>[]>
  findAll: (opts?: TOpts) => Promise<PublicRow<TTable, THidden>[]>
  findOne: (filters: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<PublicRow<TTable, THidden> | null>
  findById: (id: PkValue, opts?: TOpts) => Promise<PublicRow<TTable, THidden> | null>
  findByIdIn: (ids: (string | number)[], opts?: TOpts) => Promise<PublicRow<TTable, THidden>[]>
  create: (input: InferInput<TTable>, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  createMany: (inputs: InferInput<TTable>[], opts?: TOpts) => Promise<PublicRow<TTable, THidden>[]>
  update: (id: PkValue, input: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  upsert: (input: InferInput<TTable>, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  destroy: (id: PkValue, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  destroyAll: (filters: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<number>
  /** Count rows matching filters and/or a where clause. */
  count: (filters?: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<number>
  /** Check if any row matches the filters and/or where clause. */
  exists: (filters: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<boolean>
  /** Look up a row by filter and return its primary key value. */
  ref: (filter: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<PkValue>
}

/**
 * Soft-delete operations, present only on stores configured with
 * `softDelete: true`. These exist at runtime whenever soft delete is enabled
 * (see `buildDefaultCrud` in `store/repository.ts`); this type makes them
 * visible to TypeScript so `store.restore(...)` type-checks without a cast.
 * A store without `softDelete: true` does not expose these methods.
 *
 * Generic over `TTable` like `DefaultCRUD` — row/filter types narrow to the
 * inferred table types (with `hidden` columns omitted via `PublicRow`), falling
 * back to `any` for the base `Table`.
 */
type SoftDeleteCRUD<TTable extends Table = Table, TOpts = QueryOptions<TTable>, THidden extends string = never> = {
  /** Restore a soft-deleted row (clears `deletedAt`). Returns the restored row. */
  restore: (id: PkValue, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  /** Permanently delete a row, bypassing soft delete. Returns the deleted row. */
  forceDestroy: (id: PkValue, opts?: TOpts) => Promise<PublicRow<TTable, THidden>>
  /** Permanently delete all rows matching filters, bypassing soft delete. Returns the deleted count. */
  forceDestroyAll: (filters: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<number>
  /** Find rows including soft-deleted ones (skips the `deletedAt IS NULL` filter). */
  findWithDeleted: (filters?: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<PublicRow<TTable, THidden>[]>
  /** Count rows including soft-deleted ones. */
  countWithDeleted: (filters?: Partial<InferInput<TTable>>, opts?: TOpts) => Promise<number>
}

/**
 * A Store is a live object with CRUD operations, custom queries, and
 * runtime schemas. Produced by `db.defineStore()` or `db.register()`.
 *
 * `TSoftDelete` is captured from `defineStore`'s config: when `softDelete: true`,
 * the store additionally exposes `SoftDeleteCRUD<TTable>` (restore, forceDestroy,
 * findWithDeleted, …). It defaults to `false`, so a plain store has the default
 * CRUD surface only.
 *
 * `THidden` is the union of columns marked `hidden: true` in the config; the
 * public CRUD methods omit those columns from their returned rows (`PublicRow`).
 * It defaults to `never`, so a store with no hidden columns is unaffected.
 */
export type Store<
  TTable extends Table = Table,
  TQueries extends QueriesConfig = {},
  TSoftDelete extends boolean = false,
  THidden extends string = never,
> = DefaultCRUD<TTable, QueryOptions<TTable>, THidden>
  & (TSoftDelete extends true ? SoftDeleteCRUD<TTable, QueryOptions<TTable>, THidden> : {})
  & {
    /** The table name this store operates on. */
    name: string
    schemas: SchemaSet<TTable>
  }
  & {
    [K in keyof TQueries]: TQueries[K] extends (ctx: any) => infer R ? R : never
  }

/**
 * Infer `Store<Q>` from any object with `tableDef` and `queryFns` fields.
 * Used by `register()` to preserve generic parameters without importing
 * StoreDefinition (which would create a circular dependency with types.ts).
 */
export type InferStore<T> =
  T extends { tableDef: infer TT extends Table; queryFns: infer Q extends QueriesConfig; softDelete: infer SD extends boolean; hiddenColumns: readonly (infer H extends string)[] }
    ? Store<TT, Q, SD, H>
    : T extends { tableDef: infer TT extends Table; queryFns: infer Q extends QueriesConfig; softDelete: infer SD extends boolean }
      ? Store<TT, Q, SD>
      : T extends { tableDef: infer TT extends Table; queryFns: infer Q extends QueriesConfig }
        ? Store<TT, Q>
        : T extends { tableDef: any; queryFns: infer Q extends QueriesConfig }
          ? Store<Table, Q>
          : Store

// ---------------------------------------------------------- Cache Adapter --

/** Interface for cache implementations (Redis, Memcached, in-memory, etc.). */
export type CacheAdapter = {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ttl?: number) => Promise<void>
  del: (key: string) => Promise<void>
  delPattern: (pattern: string) => Promise<void>
}

/** Cache configuration for a single repository method. */
export type CacheMethodConfig = {
  ttl: number
  key: (...args: any[]) => string
}

// ------------------------------------------------------- Pagination --

/** Options for `paginate()` — extends PrepOptions with page info. */
export type PaginateOptions = PrepOptions & {
  /** 1-indexed page number. */
  page: number
  /** Rows per page. Defaults to 25. */
  pageSize?: number
}

/** Result from `paginate()`. */
export type PaginateResult<T = any> = {
  data: T[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// ----------------------------------------------------------- Connect Config --

/**
 * Configuration for `storium.connect()`.
 *
 * Accepts both storium's inline shape and drizzle-kit's config shape.
 * Storium normalizes either: `config.url ?? config.dbCredentials?.url ?? buildUrl(config)`.
 *
 * Storium-specific keys (assertions, pool, seeds) are ignored by drizzle-kit,
 * so a single config object can be shared between both.
 */
export type StoriumConfig<D extends Dialect = Dialect> = {
  dialect: D
  /** Connection URL (storium inline style). */
  url?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  /** Drizzle-kit style connection credentials. */
  dbCredentials?: {
    url?: string
    host?: string
    port?: number
    database?: string
    user?: string
    password?: string
  }
  /** Glob path(s) to schema files (used by drizzle-kit). */
  schema?: string | string[]
  /** Migration output directory (used by drizzle-kit). */
  out?: string
  /** Connection pool settings (storium-specific). */
  pool?: { min?: number; max?: number }
  /** User-defined named assertions for `test()` (storium-specific). */
  assertions?: AssertionRegistry
  /** Seeds directory path (storium-specific; drizzle-kit ignores this). */
  seeds?: string
  /** Glob path(s) to store files (storium-specific; drizzle-kit ignores this). */
  stores?: string | string[]
}

/**
 * Options for `storium.fromDrizzle()`.
 * Dialect is auto-detected from the Drizzle instance.
 */
export type FromDrizzleOptions = {
  /** User-defined named assertions for `test()`. */
  assertions?: AssertionRegistry
  /**
   * Explicit dialect override. When provided, bypasses automatic dialect
   * inference from the Drizzle instance's constructor name. Use this when
   * bundlers/minifiers mangle class names or when inference fails.
   *
   * Excludes 'memory' because fromDrizzle operates on real Drizzle instances
   * which are never the memory dialect (memory is resolved to sqlite at connect time).
   */
  dialect?: Exclude<Dialect, 'memory'>
}

/** The Storium instance returned by `connect()` or `fromDrizzle()`. */
export type StoriumInstance<D extends Dialect = Dialect> = {
  /**
   * The Drizzle database instance (escape hatch).
   */
  drizzle: DrizzleDatabase<D>
  /** The Zod namespace (convenience accessor matching db.drizzle). */
  zod: typeof ZodNamespace
  /** The active dialect. */
  dialect: D
  /**
   * Create a live store from a Drizzle table (simple path — no register step).
   * Optionally chain `.queries()` to add custom query functions with full ctx inference.
   *
   * Overloaded so that `{ softDelete: true }` is captured at the type level: a
   * soft-delete store additionally exposes `restore` / `forceDestroy` /
   * `findWithDeleted` / … (both on the store and inside `ctx`). The config is
   * captured with a `const` type parameter so `columns.<col>.hidden: true`
   * literals are recovered (`HiddenKeys`) and those columns are omitted from the
   * store's public row types. Column keys in `config.columns` are still
   * constrained to the table's columns (typos are compile errors).
   *
   * @example
   * const users = db.defineStore(usersTable)
   * const users = db.defineStore(usersTable, { columns: { email: { required: true } } })
   * const users = db.defineStore(usersTable).queries({ findByEmail: (ctx) => ... })
   * const users = db.defineStore(usersTable, { softDelete: true }) // exposes restore()
   * const users = db.defineStore(usersTable, { columns: { password: { hidden: true } } })
   * //    users.findOne(...) row type omits `password`
   */
  defineStore: {
    <TTable extends Table, const TConfig extends StoreConfig<TTable> & { softDelete: true }>(
      drizzleTable: TTable,
      config: TConfig
    ): Store<TTable, {}, true, HiddenKeys<TConfig>> & {
      queries: <
        TFns extends Record<string, (ctx: RepositoryContext<D, TTable, true>) => (...args: any[]) => any>
      >(
        queryFns: TFns
      ) => Store<TTable, TFns, true, HiddenKeys<TConfig>>
    }
    <TTable extends Table = Table, const TConfig extends StoreConfig<TTable> = StoreConfig<TTable>>(
      drizzleTable: TTable,
      config?: TConfig
    ): Store<TTable, {}, false, HiddenKeys<TConfig>> & {
      queries: <
        TFns extends Record<string, (ctx: RepositoryContext<D, TTable, false>) => (...args: any[]) => any>
      >(
        queryFns: TFns
      ) => Store<TTable, TFns, false, HiddenKeys<TConfig>>
    }
  }
  /** Materialize StoreDefinitions into live stores with CRUD + queries. */
  register: <T extends Record<string, any>>(
    storeDefs: T
  ) => { [K in keyof T]: InferStore<T[K]> }
  /**
   * Scoped transaction helper (pre-bound to db). The `tx` handle is the
   * dialect's Drizzle database/transaction object — pass it as `opts.tx` to
   * any store method to enlist it in the transaction.
   */
  transaction: <T>(fn: (tx: DrizzleDatabase<D>) => Promise<T>) => Promise<T>
  /** Close the database connection pool. */
  disconnect: () => Promise<void>
}

/**
 * A value or a Promise of it. Matches the prep pipeline's Stage 0 (Promise resolution).
 */
export type Promisable<T> = T | Promise<T>
