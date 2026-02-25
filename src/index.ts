/**
 * Storium v1 — Main Entry Point
 *
 * Re-exports the public API. The default export provides `connect` and
 * `fromDrizzle` as the primary entry points. Named exports provide
 * individual utilities for consumers who import selectively.
 *
 * @example
 * import storium from 'storium'
 * const db = storium.connect({ dialect: 'postgresql', url: '...' })
 *
 * @example
 * import { withBelongsTo, withMembers, ValidationError } from 'storium'
 */

// ------------------------------------------------- Connection (default) --

import { connect, fromDrizzle } from './connect'

const storium = { connect, fromDrizzle }

export default storium
export { connect, fromDrizzle }

// -------------------------------------------------------- Core Utilities --

export {
  createDefineTable,
  createDefineStore,
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
  StoreOptions,
  Store,
  Repository,
  DefineStoreFn,
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
