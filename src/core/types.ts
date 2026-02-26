/**
 * Storium v1 — Core Type Definitions
 *
 * This module defines all shared TypeScript types for the Storium library.
 * It includes column config types, table definition types, repository types,
 * runtime schema types, and compile-time generic type utilities.
 */

import type { ZodType } from 'zod'

// ---------------------------------------------------------------- Dialect --

export type Dialect = 'postgresql' | 'mysql' | 'sqlite' | 'memory'

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
 * @param customError - Optional: string message, or callback receiving the default message
 */
export type TestFn = (
  value: unknown,
  assertion: string | ((value: unknown) => boolean),
  customError?: string | ((defaultMessage: string) => void)
) => void

// --------------------------------------------------- Column Configuration --

/** Base metadata that applies to ALL column modes (DSL, DSL+custom, raw). */
type BaseColumnMeta = {
  mutable?: boolean
  writeOnly?: boolean
  required?: boolean
  transform?: (value: any) => any | Promise<any>
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

/** DSL-managed column — type string drives the Drizzle builder automatically. */
export type DslColumnConfig = BaseColumnMeta & {
  type: DslType
  primaryKey?: boolean
  notNull?: boolean
  maxLength?: number
  default?: 'now' | 'random_uuid' | string | number | boolean | Record<string, unknown>
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
  /** Columns included in SELECT (all except writeOnly). */
  selectable: string[]
  /** Columns allowed in UPDATE input. */
  mutable: string[]
  /** Columns allowed in INSERT input (mutable + required). */
  insertable: string[]
  /** Columns excluded from SELECT (present in INSERT/UPDATE input only). */
  writeOnly: string[]
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

/** JSON Schema options. */
export type JsonSchemaOptions = {
  additionalProperties?: boolean
}

/** A plain JSON Schema object. */
export type JsonSchema = {
  type: 'object'
  properties: Record<string, any>
  required?: string[]
  additionalProperties?: boolean
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
  select: RuntimeSchema
  insert: RuntimeSchema
  update: RuntimeSchema
  full: RuntimeSchema
}

// ------------------------------------------------------------ Table Def --

/**
 * A table definition produced by `defineTable()`. Contains the Drizzle table,
 * column metadata, access rules, and auto-generated schemas.
 *
 * Satisfies the interface required by `defineStore()`, `withBelongsTo()`,
 * `withMembers()`, and foreign key references.
 */
export type TableDef<TColumns extends ColumnsConfig = ColumnsConfig> = {
  /** The real Drizzle table object (for queries, migrations, drizzle-kit). */
  table: any
  /** Original column configuration (for introspection). */
  columns: TColumns
  /** Derived access sets. */
  access: TableAccess
  /** Pre-built Drizzle column map for `db.select()`. */
  selectColumns: Record<string, any>
  /** Name of the primary key column. */
  primaryKey: string
  /** Table name. */
  name: string
  /** Auto-generated runtime schemas. */
  schemas: SchemaSet
}

// ----------------------------------------------------------- Prep Options --

/** Options for the `prep` pipeline (used by `create` and `update`). */
export type PrepOptions = {
  /** Skip the entire pipeline and pass input through raw. Default: false. */
  force?: boolean
  /** Enforce required fields. Default: true for create, false for update. */
  validateRequired?: boolean
  /** Strip non-mutable keys from input. Default: false for create, true for update. */
  onlyMutables?: boolean
  /** Participate in an external transaction. */
  tx?: any
  /** Limit the number of rows returned (find, findAll). */
  limit?: number
  /** Skip this many rows before returning results (find, findAll). */
  offset?: number
}

// ------------------------------------------------------- Repository / Store --

/**
 * The context object passed to custom query functions.
 * Contains the database handle, table metadata, default CRUD operations,
 * and the prep pipeline.
 */
export type RepositoryContext<T extends TableDef = TableDef> = {
  /** The raw Drizzle database instance (escape hatch). */
  drizzle: any
  /** The Zod namespace (convenience accessor matching ctx.drizzle). */
  zod: typeof import('zod').z
  /** The Drizzle table object. */
  table: T['table']
  /** The full TableDef. */
  tableDef: T
  /** Pre-built column map for select(). */
  selectColumns: T['selectColumns']
  /** Primary key column name. */
  primaryKey: string
  /** Runtime schemas. */
  schemas: T['schemas']
  /** The filter → transform → validate pipeline. */
  prep: (input: Record<string, any>, opts?: PrepOptions) => Promise<Record<string, any>>
  /** Default CRUD operations (always originals, even if overridden). */
  find: (filters: Record<string, any>, opts?: PrepOptions) => Promise<any[]>
  findAll: (opts?: PrepOptions) => Promise<any[]>
  findOne: (filters: Record<string, any>, opts?: PrepOptions) => Promise<any | null>
  findById: (id: string | number, opts?: PrepOptions) => Promise<any | null>
  findByIdIn: (ids: (string | number)[], opts?: PrepOptions) => Promise<any[]>
  create: (input: Record<string, any>, opts?: PrepOptions) => Promise<any>
  update: (id: string | number, input: Record<string, any>, opts?: PrepOptions) => Promise<any>
  destroy: (id: string | number, opts?: PrepOptions) => Promise<void>
  destroyAll: (filters: Record<string, any>, opts?: PrepOptions) => Promise<number>
}

/**
 * A custom query function receives the repository context and returns
 * the actual query function. This enables closure over `ctx` and
 * composition with default CRUD operations.
 */
export type CustomQueryFn<T extends TableDef = TableDef> =
  (ctx: RepositoryContext<T>) => (...args: any[]) => any

/** Default CRUD operations present on every store/repository. */
export type DefaultCRUD = {
  find: (filters: Record<string, any>, opts?: PrepOptions) => Promise<any[]>
  findAll: (opts?: PrepOptions) => Promise<any[]>
  findOne: (filters: Record<string, any>, opts?: PrepOptions) => Promise<any | null>
  findById: (id: string | number, opts?: PrepOptions) => Promise<any | null>
  findByIdIn: (ids: (string | number)[], opts?: PrepOptions) => Promise<any[]>
  create: (input: Record<string, any>, opts?: PrepOptions) => Promise<any>
  update: (id: string | number, input: Record<string, any>, opts?: PrepOptions) => Promise<any>
  destroy: (id: string | number, opts?: PrepOptions) => Promise<void>
  destroyAll: (filters: Record<string, any>, opts?: PrepOptions) => Promise<number>
}

/**
 * A Store is a TableDef with CRUD operations and custom queries directly on it.
 * Produced by `defineStore()`.
 */
export type Store<
  TColumns extends ColumnsConfig = ColumnsConfig,
  TQueries extends Record<string, CustomQueryFn> = {}
> = TableDef<TColumns> & DefaultCRUD & {
  [K in keyof TQueries]: TQueries[K] extends (ctx: any) => infer R ? R : never
}

/**
 * A Repository is the same shape as a Store, produced by `createRepository()`.
 */
export type Repository<
  TTableDef extends TableDef = TableDef,
  TQueries extends Record<string, CustomQueryFn> = {}
> = TTableDef & DefaultCRUD & {
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
export type ConnectConfig = {
  dialect: Dialect
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
export type StoriumInstance = {
  /** Raw Drizzle instance (escape hatch). */
  drizzle: any
  /** The Zod namespace (convenience accessor matching db.drizzle). */
  zod: typeof import('zod').z
  /** The active dialect. */
  dialect: Dialect
  /** Create a table definition (pre-bound to dialect + assertions). */
  defineTable: <TColumns extends ColumnsConfig>(
    name: string,
    columns: TColumns,
    options?: TableOptions
  ) => TableDef<TColumns>
  /**
   * Create a live store directly (simple path — no register step).
   *
   * Two overloads:
   * - `db.defineStore('users', columns, { queries })` — one-call, schema + store
   * - `db.defineStore(tableDef, { queries })` — wrap existing TableDef
   */
  defineStore: {
    <TColumns extends ColumnsConfig, TQueries extends Record<string, CustomQueryFn>>(
      name: string,
      columns: TColumns,
      options?: TableOptions & { queries?: TQueries }
    ): Store
    <TColumns extends ColumnsConfig, TQueries extends Record<string, CustomQueryFn>>(
      tableDef: TableDef<TColumns>,
      queries?: TQueries
    ): Store
  }
  /** Materialize StoreDefinitions into live stores with CRUD + queries. */
  register: <T extends Record<string, any>>(
    storeDefs: T
  ) => { [K in keyof T]: Store }
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
  primaryKey?: string
  timestamps?: boolean
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
}

/** Resolve the TypeScript type for a single column config. */
type ResolveColumnType<C extends ColumnConfig> =
  C extends RawColumnConfig ? any :
  C extends { type: infer T extends keyof DslTypeToTs } ? DslTypeToTs[T] :
  never

/**
 * Derive the SELECT result type from a columns config.
 * Excludes writeOnly columns.
 */
export type SelectType<TColumns extends ColumnsConfig> = {
  [K in keyof TColumns as TColumns[K] extends { writeOnly: true } ? never : K]:
    ResolveColumnType<TColumns[K]>
}

/**
 * Derive the INSERT input type from a columns config.
 * Includes required fields as mandatory, mutable fields as optional.
 * Excludes non-insertable columns (no mutable, no required).
 */
export type InsertType<TColumns extends ColumnsConfig> =
  // Required fields (required: true)
  { [K in keyof TColumns as TColumns[K] extends { required: true } ? K : never]:
      ResolveColumnType<TColumns[K]> }
  &
  // Optional mutable fields (mutable: true, not required)
  { [K in keyof TColumns as
      TColumns[K] extends { mutable: true }
        ? TColumns[K] extends { required: true } ? never : K
        : never
    ]?: ResolveColumnType<TColumns[K]> }

/**
 * Derive the UPDATE input type from a columns config.
 * Only mutable columns, all optional.
 */
export type UpdateType<TColumns extends ColumnsConfig> = {
  [K in keyof TColumns as TColumns[K] extends { mutable: true } ? K : never]?:
    ResolveColumnType<TColumns[K]>
}
