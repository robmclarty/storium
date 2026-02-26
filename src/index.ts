/**
 * Storium v1 — Main Entry Point
 *
 * All public API is available as named exports from 'storium'.
 * The `storium` namespace provides `connect` and `fromDrizzle`.
 *
 * @example
 * import { storium, defineTable, defineStore, defineConfig } from 'storium'
 *
 * const db = storium.connect(config)
 * const stores = db.register({ users: userStore })
 */

// ------------------------------------------------- Connection namespace --

import { connect, fromDrizzle } from './connect'

export const storium = { connect, fromDrizzle }

// ---------------------------------------------------- Config --

export { defineConfig } from './config'

// ------------------------------------------------- Schema & Store DSL --

export {
  defineTable,
  defineStore,
  isStoreDefinition,
} from './core'

// -------------------------------------------------------- Core Utilities --

export {
  buildDefineTable,
  createCreateRepository,
  createTestFn,
  createAssertionRegistry,
  BUILTIN_ASSERTIONS,
  ValidationError,
  ConfigError,
  SchemaError,
  buildSchemaSet,
} from './core'

// -------------------------------------------------------------- Helpers --

export {
  withMembers,
  withBelongsTo,
  withCache,
  createWithTransaction,
} from './helpers'

// --------------------------------------------------------------- Types --

export type {
  StoreDefinition,
} from './core'

export type {
  // Dialect & config
  Dialect,
  ConnectConfig,
  StoriumConfig,
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
  CustomQueryFn,
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
  SelectType,
  InsertType,
  UpdateType,
} from './core'
