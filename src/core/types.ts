/**
 * @module types
 *
 * This module defines all shared TypeScript types for the Storium library.
 * It includes column config types, table definition types, repository types,
 * runtime schema types, and compile-time generic type utilities.
 */

import type { ZodType, z as ZodNamespace } from 'zod'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { MySqlDatabase } from 'drizzle-orm/mysql-core'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { StoriumMeta } from './defineTable'

// ---------------------------------------------------------------- Dialect --

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'memory'

// -------------------------------------------------------- Drizzle Database --

/**
 * Maps a Storium dialect to its Drizzle database type.
 * When `D` is a specific dialect literal, resolves to the concrete Drizzle class.
 * When `D` is the full `Dialect` union, resolves to the union of all classes.
 *
 * Imported from the `drizzle-orm` peer dep (type-only, zero runtime coupling).
 */
export type DrizzleDatabase<D extends Dialect = Dialect> =
  D extends 'postgresql' ? PgDatabase<any, any, any> :
  D extends 'mysql' ? MySqlDatabase<any, any, any, any> :
  D extends 'sqlite' | 'memory' ? BaseSQLiteDatabase<any, any, any, any> :
  PgDatabase<any, any, any> | MySqlDatabase<any, any, any, any> | BaseSQLiteDatabase<any, any, any, any>

/**
 * Infer the Storium dialect from a Drizzle database type.
 * Used by `fromDrizzle()` to auto-detect dialect at the type level.
 */
export type InferDialect<DB> =
  DB extends PgDatabase<any, any, any> ? 'postgresql' :
  DB extends MySqlDatabase<any, any, any, any> ? 'mysql' :
  DB extends BaseSQLiteDatabase<any, any, any, any> ? 'sqlite' :
  Dialect

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

// --------------------------------------------------- Column Configuration --

/** Base metadata that applies to ALL column modes (DSL, DSL+custom, raw). */
type BaseColumnMeta = {
  /** Exclude from write operations (create + update). Always true for primaryKey columns. */
  readonly?: boolean
  /** Exclude from SELECT results. Implies writable (e.g., password hashes). */
  hidden?: boolean
  /** Must be provided on create. */
  required?: boolean
  transform?: (value: any) => unknown | Promise<unknown>
  validate?: (value: any, test: TestFn) => void
}

/** Supported DSL type strings. */
export type DslType =
  | 'uuid'
  | 'varchar'
  | 'text'
  | 'integer'
  | 'bigint'
  | 'serial'
  | 'real'
  | 'numeric'
  | 'boolean'
  | 'timestamp'
  | 'date'
  | 'jsonb'
  | 'array'

/** DSL-managed column — type string drives the Drizzle builder automatically. */
export type DslColumnConfig = BaseColumnMeta & {
  type: DslType
  primaryKey?: boolean
  notNull?: boolean
  maxLength?: number
  default?: 'now' | 'random_uuid' | string | number | boolean | Record<string, unknown> | unknown[]
  /** Element type for array columns (e.g. 'text', 'integer', 'uuid'). */
  items?: DslType
  /**
   * Override the database column name. The DSL key becomes the JS property
   * name while `dbName` is used as the actual SQL column name.
   */
  dbName?: string
  /** Modify the auto-built Drizzle column before finalization. */
  custom?: (col: any) => any
}

/** Raw Drizzle column — caller provides the builder directly. */
export type RawColumnConfig = BaseColumnMeta & {
  /** Provide a raw Drizzle column builder, bypassing the DSL entirely. */
  raw: () => any
}

/** A column config is either DSL-managed or raw. */
export type ColumnConfig = DslColumnConfig | RawColumnConfig

/** Type guard: is this a raw column config? */
export const isRawColumn = (config: ColumnConfig | undefined): config is RawColumnConfig =>
  !!config && 'raw' in config && typeof (config as any).raw === 'function'

/** A record of column names to their configs. */
export type ColumnsConfig = Record<string, ColumnConfig>

// --------------------------------------------------- Index Configuration --

/** DSL index definition. */
export type DslIndexConfig = {
  /**
   * Columns in the index, in order. If absent, uses the key name as a
   * single-column reference.
   */
  columns?: string[]
  /** Create a unique index. Default: false. */
  unique?: boolean
  /**
   * Explicit index name. If absent, auto-generated:
   * - Regular: `{table}_{keyName}_idx`
   * - Unique: `{table}_{keyName}_unique`
   */
  name?: string
  /** Partial index condition (PostgreSQL). */
  where?: (table: any) => any
}

/** Raw Drizzle index — caller provides the full index definition. */
export type RawIndexConfig = {
  raw: (table: any) => any
}

/** An index config is either DSL-managed or raw. */
export type IndexConfig = DslIndexConfig | RawIndexConfig

/** Type guard: is this a raw index config? */
export const isRawIndex = (config: IndexConfig): config is RawIndexConfig =>
  'raw' in config && typeof (config as any).raw === 'function'

/** A record of index labels to their configs. */
export type IndexesConfig = Record<string, IndexConfig>

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
export type SchemaSet<TColumns extends ColumnsConfig = ColumnsConfig> = {
  selectSchema: RuntimeSchema<SelectType<TColumns>>
  createSchema: RuntimeSchema<InsertType<TColumns>>
  updateSchema: RuntimeSchema<UpdateType<TColumns>>
  fullSchema: RuntimeSchema<{ [K in keyof TColumns]: ResolveColumnType<TColumns[K]> }>
}

// ------------------------------------------------------------ Table Def --

/**
 * A table definition: a plain Drizzle table object with storium metadata
 * attached as a non-enumerable `.storium` property.
 *
 * Returned by `defineTable()`. Compatible with drizzle-kit (which sees a
 * real Drizzle table) and storium (which reads `table.storium.*`).
 */
export type TableDef<TColumns extends ColumnsConfig = ColumnsConfig> = {
  /** Storium metadata (columns, access sets, schemas, etc.). */
  storium: StoriumMeta<TColumns>
  /** Drizzle column access — any other property is a Drizzle column. */
  [key: string]: any
}

// ----------------------------------------------------------- Prep Options --

/** A single orderBy directive: column name + direction. */
export type OrderBySpec = {
  column: string
  direction?: 'asc' | 'desc'
}

/** Options for the `prep` pipeline (used by `create` and `update`). */
export type PrepOptions = {
  /** Skip the entire pipeline and pass input through raw. Default: false. */
  force?: boolean
  /** Enforce required fields. Default: true for create, false for update. */
  validateRequired?: boolean
  /** Strip non-writable keys from input. Default: false for create, true for update. */
  onlyWritable?: boolean
  /** Participate in an external transaction. */
  tx?: any
  /** Limit the number of rows returned (find, findAll). */
  limit?: number
  /** Skip this many rows before returning results (find, findAll). */
  offset?: number
  /**
   * Sort results. Accepts a single spec or array of specs.
   * Each spec is `{ column, direction }` where direction defaults to `'asc'`.
   *
   * @example
   * await users.findAll({ orderBy: { column: 'createdAt', direction: 'desc' } })
   * await users.findAll({ orderBy: [{ column: 'lastName' }, { column: 'firstName' }] })
   */
  orderBy?: OrderBySpec | OrderBySpec[]
  /**
   * Include hidden columns in the result. Default: false.
   * Use this for specific operations that need sensitive data (e.g. password
   * hash comparison during authentication). The flag is intentionally verbose
   * so it stands out in code review.
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
  T extends TableDef = TableDef,
  TColumns extends ColumnsConfig = T extends TableDef<infer C> ? C : ColumnsConfig,
  D extends Dialect = Dialect
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
  /** The Drizzle table object (same as tableDef — it IS the Drizzle table). */
  table: T
  /** The Drizzle table with `.storium` metadata. */
  tableDef: T
  /** Pre-built column map for select() (excludes hidden columns). */
  selectColumns: Record<string, any>
  /** Full column map including hidden columns. */
  allColumns: Record<string, any>
  /** Primary key column name(s). String for single PK, array for composite. */
  primaryKey: string | string[]
  /** Runtime schemas. */
  schemas: SchemaSet<TColumns>
  /** The filter → transform → validate pipeline. */
  prep: (input: Record<string, any>, opts?: PrepOptions) => Promise<Record<string, any>>
  /** Default CRUD operations (always originals, even if overridden). */
  find: (filters: Record<string, any>, opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  findAll: (opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  findOne: (filters: Record<string, any>, opts?: PrepOptions) => Promise<SelectType<TColumns> | null>
  findById: (id: PkValue, opts?: PrepOptions) => Promise<SelectType<TColumns> | null>
  findByIdIn: (ids: (string | number)[], opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  create: (input: InsertType<TColumns>, opts?: PrepOptions) => Promise<SelectType<TColumns>>
  update: (id: PkValue, input: UpdateType<TColumns>, opts?: PrepOptions) => Promise<SelectType<TColumns>>
  destroy: (id: PkValue, opts?: PrepOptions) => Promise<void>
  destroyAll: (filters: Record<string, any>, opts?: PrepOptions) => Promise<number>
  ref: (filter: Record<string, any>, opts?: PrepOptions) => Promise<PkValue>
}

/** Shorthand alias for `RepositoryContext` — use as `ctx: Ctx` in custom queries. */
export type Ctx<
  T extends TableDef = TableDef,
  TColumns extends ColumnsConfig = T extends TableDef<infer C> ? C : ColumnsConfig,
  D extends Dialect = Dialect
> = RepositoryContext<T, TColumns, D>

/**
 * A custom query function receives the repository context and returns
 * the actual query function. This enables closure over `ctx` and
 * composition with default CRUD operations.
 */
export type CustomQueryFn<T extends TableDef = TableDef, D extends Dialect = Dialect> =
  (ctx: RepositoryContext<T, T extends TableDef<infer C> ? C : ColumnsConfig, D>) => (...args: any[]) => any

/**
 * Constraint type for custom query function records.
 * Each entry is a factory: receives ctx, returns the actual query function.
 */
export type QueriesConfig = Record<string, (ctx: any) => (...args: any[]) => any>

/** Default CRUD operations present on every store/repository. */
export type DefaultCRUD<TColumns extends ColumnsConfig = ColumnsConfig> = {
  find: (filters: Record<string, any>, opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  findAll: (opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  findOne: (filters: Record<string, any>, opts?: PrepOptions) => Promise<SelectType<TColumns> | null>
  findById: (id: PkValue, opts?: PrepOptions) => Promise<SelectType<TColumns> | null>
  findByIdIn: (ids: (string | number)[], opts?: PrepOptions) => Promise<SelectType<TColumns>[]>
  create: (input: InsertType<TColumns>, opts?: PrepOptions) => Promise<SelectType<TColumns>>
  update: (id: PkValue, input: UpdateType<TColumns>, opts?: PrepOptions) => Promise<SelectType<TColumns>>
  destroy: (id: PkValue, opts?: PrepOptions) => Promise<void>
  destroyAll: (filters: Record<string, any>, opts?: PrepOptions) => Promise<number>
  /** Look up a row by filter and return its primary key value. */
  ref: (filter: Record<string, any>, opts?: PrepOptions) => Promise<PkValue>
}

/**
 * A Store is a live object with CRUD operations, custom queries, and
 * runtime schemas. Produced by `db.defineStore()` or `db.register()`.
 */
export type Store<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends QueriesConfig = {}
> = DefaultCRUD<TColumns> & {
  schemas: SchemaSet<TColumns>
} & {
  [K in keyof TQueries]: TQueries[K] extends (ctx: any) => infer R ? R : never
}

/**
 * Infer `Store<C, Q>` from any object with `tableDef` and `queries` fields.
 * Used by `register()` to preserve generic parameters without importing
 * StoreDefinition (which would create a circular dependency with types.ts).
 */
export type InferStore<T> =
  T extends { tableDef: TableDef<infer C extends ColumnsConfig>; queries: infer Q extends QueriesConfig }
    ? Store<C, Q>
    : Store

/**
 * A Repository is the same shape as a Store, produced by `createRepository()`.
 */
export type Repository<
  TTableDef extends TableDef = TableDef,
  TQueries extends QueriesConfig = {}
> = DefaultCRUD<TTableDef extends TableDef<infer C> ? C : ColumnsConfig> & {
  schemas: SchemaSet<TTableDef extends TableDef<infer C> ? C : ColumnsConfig>
} & {
  [K in keyof TQueries]: TQueries[K] extends (ctx: any) => infer R ? R : never
}

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
   * When `D` is a specific dialect (inferred from config or `fromDrizzle`),
   * this resolves to the concrete Drizzle class with full autocomplete.
   * When `D` is the full `Dialect` union (e.g., in generic code), this
   * resolves to the union of all Drizzle classes.
   */
  drizzle: DrizzleDatabase<D>
  /** The Zod namespace (convenience accessor matching db.drizzle). */
  zod: typeof ZodNamespace
  /** The active dialect. */
  dialect: D
  /** Create a table definition (pre-bound to dialect + assertions). */
  defineTable: {
    <TColumns extends ColumnsConfig>(
      name: string,
      columns: TColumns,
      options: TableOptions & { timestamps: false }
    ): TableDef<TColumns>
    <TColumns extends ColumnsConfig>(
      name: string,
      columns: TColumns,
      options?: TableOptions
    ): TableDef<TColumns & TimestampColumns>
  }
  /**
   * Create a live store from a table definition (simple path — no register step).
   *
   * @param tableDef - A table from `defineTable()` or `db.defineTable()`
   * @param queries - Optional custom query functions
   */
  defineStore: <TColumns extends ColumnsConfig, TQueries extends QueriesConfig = {}>(
    tableDef: TableDef<TColumns>,
    queries?: TQueries
  ) => Store<TColumns, TQueries>
  /** Materialize StoreDefinitions into live stores with CRUD + queries. */
  register: <T extends Record<string, any>>(
    storeDefs: T
  ) => { [K in keyof T]: InferStore<T[K]> }
  /** Scoped transaction helper (pre-bound to db). */
  transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>
  /** Close the database connection pool. */
  disconnect: () => Promise<void>
}

// --------------------------------------------------------- Options Types --

/** Options for `defineTable()`. */
export type TableOptions = {
  indexes?: IndexesConfig
  constraints?: (table: any) => Record<string, any>
  primaryKey?: string | string[]
  /** Inject createdAt/updatedAt columns. Default: true. Set to false to opt out. */
  timestamps?: boolean
}

/** Column configs for auto-injected timestamp columns. */
export type TimestampColumns = {
  createdAt: { type: 'timestamp'; notNull: true; default: 'now'; readonly: true }
  updatedAt: { type: 'timestamp'; notNull: true; default: 'now' }
}

// ------------------------------------------- Compile-Time Type Utilities --

/**
 * Map DSL type strings to TypeScript types.
 * Used by SelectType, InsertType, and UpdateType to infer types from columns.
 */
type DslTypeToTs = {
  uuid: string
  varchar: string
  text: string
  integer: number
  bigint: bigint
  serial: number
  real: number
  numeric: number
  boolean: boolean
  timestamp: Date
  date: Date
  jsonb: Record<string, unknown>
  array: unknown[]
}

/** Resolve the TypeScript type for a single column config. */
export type ResolveColumnType<C extends ColumnConfig> =
  C extends RawColumnConfig ? any :
  C extends { type: infer T extends keyof DslTypeToTs } ? DslTypeToTs[T] :
  never

/**
 * A value or a Promise of it. Matches the prep pipeline's Stage 0 (Promise resolution).
 * The Promise branch accepts `any` because `ref()` returns `Promise<string | number>`
 * and should be assignable to any field type without explicit narrowing.
 */
export type Promisable<T> = T | Promise<any>

// ---- Column access helpers (used by SelectType, InsertType, UpdateType) ----

/** Column is excluded from write operations (create + update). */
type IsReadonly<C> =
  C extends { readonly: true } ? true :
  C extends { primaryKey: true } ? true :
  false

/** Column must be provided on create. */
type IsRequired<C> = C extends { required: true } ? true : false

/** Column is excluded from read operations (select). */
type IsHidden<C> = C extends { hidden: true } ? true : false

/** SELECT result — all columns except hidden. */
export type SelectType<TColumns extends ColumnsConfig> = {
  [K in keyof TColumns as IsHidden<TColumns[K]> extends true ? never : K]:
    ResolveColumnType<TColumns[K]>
}

/** CREATE input — writable columns. Required ones are mandatory, rest optional. */
export type InsertType<TColumns extends ColumnsConfig> =
  { [K in keyof TColumns as
      IsReadonly<TColumns[K]> extends true ? never
      : IsRequired<TColumns[K]> extends true ? K
      : never
    ]: Promisable<ResolveColumnType<TColumns[K]>> }
  &
  { [K in keyof TColumns as
      IsReadonly<TColumns[K]> extends true ? never
      : IsRequired<TColumns[K]> extends true ? never
      : K
    ]?: Promisable<ResolveColumnType<TColumns[K]>> }

/** UPDATE input — writable columns, all optional. */
export type UpdateType<TColumns extends ColumnsConfig> = {
  [K in keyof TColumns as IsReadonly<TColumns[K]> extends true ? never : K]?:
    Promisable<ResolveColumnType<TColumns[K]>>
}
