/**
 * All public API is available as named exports from 'storium'.
 * The `storium` namespace provides `connect` and `fromDrizzle`.
 *
 * @example
 * import { storium, defineStore } from 'storium'
 *
 * const db = storium.connect(config)
 * const stores = db.register({ users: userStore })
 */

// ------------------------------------------------- Connection namespace --

import { connect, fromDrizzle } from './connect'

export const storium = { connect, fromDrizzle }

// ------------------------------------------------- Schema & Store DSL --

export {
  defineStore,
  isStoreDefinition,
  hasMeta,
} from './store'

// ------------------------------------------------------------ Errors --

export {
  ValidationError,
  ConfigError,
  SchemaError,
  StoreError,
} from './errors'

// -------------------------------------------------------------- Mixins --

export {
  withMembers,
  belongsTo,
  hasMany,
  hasOne,
  withCache,
  withPagination,
} from './mixins'

// --------------------------------------------------------------- Types --

export type {
  StoreDefinition,
} from './store'

export type {
  StoriumMeta,

  // Dialect & config
  Dialect,
  StoriumConfig,
  FromDrizzleOptions,
  StoriumInstance,

  // Column annotations
  ColumnAnnotation,
  ColumnAnnotations,
  StoreConfig,

  // Table & repository
  AccessConfig,
  Store,
  InferStore,
  Ctx,
  CustomQueryFn,
  QueriesConfig,
  OrderBySpec,
  QueryOptions,

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

  // Pagination
  PaginateOptions,
  PaginateResult,

  // Utility
  PkValue,
  Promisable,
} from './types'
