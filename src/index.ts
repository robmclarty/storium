/**
 * All public API is available as named exports from 'storium'.
 * The `storium` namespace provides `connect` and `fromDrizzle`.
 *
 * @example
 * import { storium, defineTable, defineStore } from 'storium'
 *
 * const db = storium.connect(config)
 * const stores = db.register({ users: userStore })
 */

// ------------------------------------------------- Connection namespace --

import { connect, fromDrizzle } from './connect'

export const storium = { connect, fromDrizzle }

// ------------------------------------------------- Schema & Store DSL --

export {
  defineTable,
  defineStore,
  isStoreDefinition,
} from './core'

// ------------------------------------------------------------ Errors --

export {
  ValidationError,
  ConfigError,
  SchemaError,
  StoreError,
} from './core'

// -------------------------------------------------------------- Mixins --

export {
  withMembers,
  withBelongsTo,
  withCache,
} from './mixins'

// --------------------------------------------------------------- Types --

export {
  isRawColumn,
  isRawIndex,
} from './core'

export type {
  StoreDefinition,
} from './core'

export type { StoriumMeta } from './core/defineTable'

export type {
  // Dialect & config
  Dialect,
  StoriumConfig,
  FromDrizzleOptions,
  StoriumInstance,

  // Column & schema
  DslType,
  DslColumnConfig,
  RawColumnConfig,
  ColumnConfig,
  ColumnsConfig,
  DslIndexConfig,
  RawIndexConfig,
  IndexConfig,
  IndexesConfig,

  // Table & repository
  TableDef,
  TableAccess,
  AccessConfig,
  TableBuilderConfig,
  TableOptions,
  TimestampColumns,
  Store,
  InferStore,
  Repository,
  DrizzleDatabase,
  InferDialect,
  DefaultCRUD,
  RepositoryContext,
  Ctx,
  CustomQueryFn,
  QueriesConfig,
  OrderBySpec,
  PrepOptions,

  // Schema & validation
  RuntimeSchema,
  SchemaSet,
  JsonSchema,
  JsonSchemaOptions,
  FieldError,
  ValidationResult,

  // Assertions
  AssertionFn,
  AssertionRegistry,
  TestFn,
  ValidatorTest,

  // Cache
  CacheAdapter,
  CacheMethodConfig,

  // Compile-time type utilities
  PkValue,
  Promisable,
  ResolveColumnType,
  SelectType,
  InsertType,
  UpdateType,
} from './core'
