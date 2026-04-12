/**
 * @module types
 *
 * This module defines all shared TypeScript types for the Storium library.
 * It includes column annotation types, table definition types, repository types,
 * runtime schema types, and compile-time generic type utilities.
 */

import type { SQL } from 'drizzle-orm'
import type { ZodType, z as ZodNamespace } from 'zod'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { MySqlDatabase } from 'drizzle-orm/mysql-core'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

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
 */
export type StoreConfig = {
  /** Per-column annotations (validation, access control, transforms). */
  columns?: ColumnAnnotations
  /** Enable soft delete. The Drizzle table must have a `deletedAt` column. */
  softDelete?: boolean
}

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

/** The full set of runtime schemas derived from a table definition. */
export type SchemaSet = {
  selectSchema: RuntimeSchema
  createSchema: RuntimeSchema
  updateSchema: RuntimeSchema
  fullSchema: RuntimeSchema
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
export type QueryOptions = {
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
  where?: (table: any) => SQL | undefined
  /**
   * Columns to target for conflict detection in `upsert()`.
   * Defaults to the primary key. Pass column names for unique constraint targets.
   */
  conflictTarget?: string[]
}

/**
 * Internal options extending QueryOptions with escape hatches.
 * Available inside custom queries via `ctx` methods, but not on the public Store type.
 */
export type PrepOptions = QueryOptions & {
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
export type RepositoryContext<D extends Dialect = Dialect> = {
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
  /** The Drizzle table object with `.storium` metadata. */
  table: TableDef
  /** Pre-built column map for select() (excludes hidden columns). */
  selectColumns: Record<string, any>
  /** Full column map including hidden columns. */
  allColumns: Record<string, any>
  /** Primary key column name(s). String for single PK, array for composite. */
  primaryKey: string | string[]
  /** Runtime schemas. */
  schemas: SchemaSet
  /** The filter → transform → validate pipeline. */
  prep: (input: Record<string, any>, opts?: PrepOptions) => Promise<Record<string, any>>
} & DefaultCRUD

/**
 * Shorthand for `RepositoryContext` — the context object passed to custom
 * query factories.
 */
export type Ctx<D extends Dialect = Dialect> = RepositoryContext<D>

/**
 * A custom query function receives the repository context and returns
 * the actual query function. This enables closure over `ctx` and
 * composition with default CRUD operations.
 */
export type CustomQueryFn<D extends Dialect = Dialect> =
  (ctx: RepositoryContext<D>) => (...args: any[]) => any

/**
 * Constraint type for custom query function records.
 * Each entry is a factory: receives ctx, returns the actual query function.
 */
export type QueriesConfig = Record<string, (ctx: any) => (...args: any[]) => any>

/** Default CRUD operations present on every store/repository. */
export type DefaultCRUD = {
  find: (filters: Record<string, any>, opts?: QueryOptions) => Promise<any[]>
  findAll: (opts?: QueryOptions) => Promise<any[]>
  findOne: (filters: Record<string, any>, opts?: QueryOptions) => Promise<any | null>
  findById: (id: PkValue, opts?: QueryOptions) => Promise<any | null>
  findByIdIn: (ids: (string | number)[], opts?: QueryOptions) => Promise<any[]>
  create: (input: Record<string, any>, opts?: QueryOptions) => Promise<any>
  createMany: (inputs: Record<string, any>[], opts?: QueryOptions) => Promise<any[]>
  update: (id: PkValue, input: Record<string, any>, opts?: QueryOptions) => Promise<any>
  upsert: (input: Record<string, any>, opts?: QueryOptions) => Promise<any>
  destroy: (id: PkValue, opts?: QueryOptions) => Promise<void>
  destroyAll: (filters: Record<string, any>, opts?: QueryOptions) => Promise<number>
  /** Count rows matching filters and/or a where clause. */
  count: (filters?: Record<string, any>, opts?: QueryOptions) => Promise<number>
  /** Check if any row matches the filters and/or where clause. */
  exists: (filters: Record<string, any>, opts?: QueryOptions) => Promise<boolean>
  /** Look up a row by filter and return its primary key value. */
  ref: (filter: Record<string, any>, opts?: QueryOptions) => Promise<PkValue>
}

/**
 * A Store is a live object with CRUD operations, custom queries, and
 * runtime schemas. Produced by `db.defineStore()` or `db.register()`.
 */
export type Store<TQueries extends QueriesConfig = {}> = DefaultCRUD & {
  /** The table name this store operates on. */
  name: string
  schemas: SchemaSet
} & {
  [K in keyof TQueries]: TQueries[K] extends (ctx: any) => infer R ? R : never
}

/**
 * Infer `Store<Q>` from any object with `tableDef` and `queryFns` fields.
 * Used by `register()` to preserve generic parameters without importing
 * StoreDefinition (which would create a circular dependency with types.ts).
 */
export type InferStore<T> =
  T extends { tableDef: TableDef; queryFns: infer Q extends QueriesConfig }
    ? Store<Q>
    : Store

/**
 * A Repository is the same shape as a Store, produced by `createRepository()`.
 */
export type Repository<TQueries extends QueriesConfig = {}> = Store<TQueries>

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
   * @example
   * const users = db.defineStore(usersTable)
   * const users = db.defineStore(usersTable, { columns: { email: { required: true } } })
   * const users = db.defineStore(usersTable).queries({ findByEmail: (ctx) => ... })
   */
  defineStore: (
    drizzleTable: any,
    config?: StoreConfig
  ) => Store & {
    queries: <TKeys extends string>(
      queryFns: Record<TKeys, (ctx: RepositoryContext<D>) => (...args: any[]) => any>
    ) => Store<Record<TKeys, (ctx: RepositoryContext<D>) => (...args: any[]) => any>>
  }
  /** Materialize StoreDefinitions into live stores with CRUD + queries. */
  register: <T extends Record<string, any>>(
    storeDefs: T
  ) => { [K in keyof T]: InferStore<T[K]> }
  /** Scoped transaction helper (pre-bound to db). */
  transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>
  /** Close the database connection pool. */
  disconnect: () => Promise<void>
}

/**
 * A value or a Promise of it. Matches the prep pipeline's Stage 0 (Promise resolution).
 */
export type Promisable<T> = T | Promise<any>
