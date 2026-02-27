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

// -------------------------------------------------------------- Helpers --

export {
  withMembers,
  withBelongsTo,
  withCache,
} from './helpers'

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
  ConnectConfig,
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
  TableOptions,
  Store,
  Repository,
  DefaultCRUD,
  RepositoryContext,
  Ctx,
  CustomQueryFn,
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

  // Cache
  CacheAdapter,
  CacheMethodConfig,

  // Compile-time type utilities
  ResolveColumnType,
  SelectType,
  InsertType,
  UpdateType,
} from './core'
