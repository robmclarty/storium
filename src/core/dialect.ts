/**
 * Storium v1 — Dialect Mapping
 *
 * Maps DSL type strings and table constructors to dialect-specific Drizzle
 * column builders and table functions. This module is the bridge between
 * Storium's database-agnostic DSL and Drizzle's dialect-specific APIs.
 *
 * Each dialect provides:
 * - `tableConstructor` — the pgTable/mysqlTable/sqliteTable function
 * - `columnBuilders` — maps DSL type strings to Drizzle column builder calls
 */

import type { Dialect, DslType, DslColumnConfig } from './types'
import { ConfigError } from './errors'

// -------------------------------------------------------------- Types --

export type ColumnBuilderFn = (name: string, config: DslColumnConfig) => any

export type DialectMapping = {
  tableConstructor: (...args: any[]) => any
  columnBuilders: Record<DslType, ColumnBuilderFn>
}

// --------------------------------------------------------- PostgreSQL --

let pgMapping: DialectMapping | null = null

const getPostgresMapping = (): DialectMapping => {
  if (pgMapping) return pgMapping

  const pg = require('drizzle-orm/pg-core')

  pgMapping = {
    tableConstructor: pg.pgTable,
    columnBuilders: {
      uuid:      (name) => pg.uuid(name),
      varchar:   (name, c) => c.maxLength ? pg.varchar(name, { length: c.maxLength }) : pg.varchar(name),
      text:      (name) => pg.text(name),
      integer:   (name) => pg.integer(name),
      bigint:    (name) => pg.bigint(name, { mode: 'bigint' }),
      serial:    (name) => pg.serial(name),
      real:      (name) => pg.real(name),
      numeric:   (name) => pg.numeric(name),
      boolean:   (name) => pg.boolean(name),
      timestamp: (name) => pg.timestamp(name, { withTimezone: true }),
      date:      (name) => pg.date(name),
      jsonb:     (name) => pg.jsonb(name),
    },
  }

  return pgMapping
}

// ------------------------------------------------------------- MySQL --

let mysqlMapping: DialectMapping | null = null

const getMysqlMapping = (): DialectMapping => {
  if (mysqlMapping) return mysqlMapping

  const mysql = require('drizzle-orm/mysql-core')

  mysqlMapping = {
    tableConstructor: mysql.mysqlTable,
    columnBuilders: {
      uuid:      (name) => mysql.varchar(name, { length: 36 }),
      varchar:   (name, c) => c.maxLength ? mysql.varchar(name, { length: c.maxLength }) : mysql.varchar(name, { length: 255 }),
      text:      (name) => mysql.text(name),
      integer:   (name) => mysql.int(name),
      bigint:    (name) => mysql.bigint(name, { mode: 'bigint' }),
      serial:    (name) => mysql.serial(name),
      real:      (name) => mysql.real(name),
      numeric:   (name) => mysql.decimal(name),
      boolean:   (name) => mysql.boolean(name),
      timestamp: (name) => mysql.timestamp(name),
      date:      (name) => mysql.date(name),
      jsonb:     (name) => mysql.json(name),
    },
  }

  return mysqlMapping
}

// ----------------------------------------------------------- SQLite --

let sqliteMapping: DialectMapping | null = null

const getSqliteMapping = (): DialectMapping => {
  if (sqliteMapping) return sqliteMapping

  const sqlite = require('drizzle-orm/sqlite-core')

  sqliteMapping = {
    tableConstructor: sqlite.sqliteTable,
    columnBuilders: {
      uuid:      (name) => sqlite.text(name),
      varchar:   (name) => sqlite.text(name),
      text:      (name) => sqlite.text(name),
      integer:   (name) => sqlite.integer(name),
      bigint:    (name) => sqlite.integer(name, { mode: 'number' }),
      serial:    (name) => sqlite.integer(name, { mode: 'number' }),
      real:      (name) => sqlite.real(name),
      numeric:   (name) => sqlite.real(name),
      boolean:   (name) => sqlite.integer(name, { mode: 'boolean' }),
      timestamp: (name) => sqlite.text(name),
      date:      (name) => sqlite.text(name),
      jsonb:     (name) => sqlite.text(name, { mode: 'json' }),
    },
  }

  return sqliteMapping
}

// -------------------------------------------------------- Public API --

/**
 * Get the dialect mapping for the given dialect. Lazily loads the
 * dialect-specific Drizzle module on first access.
 */
export const getDialectMapping = (dialect: Dialect): DialectMapping => {
  switch (dialect) {
    case 'postgresql': return getPostgresMapping()
    case 'mysql':      return getMysqlMapping()
    case 'sqlite':
    case 'memory':     return getSqliteMapping()
    default:
      throw new ConfigError(`Unknown dialect: '${dialect}'. Supported: postgresql, mysql, sqlite, memory`)
  }
}

/**
 * Build a single Drizzle column from a DSL column config.
 * Applies: type → primaryKey → notNull → default → custom
 */
export const buildDslColumn = (
  name: string,
  config: DslColumnConfig,
  dialect: Dialect
): any => {
  const mapping = getDialectMapping(dialect)
  const factory = mapping.columnBuilders[config.type]

  if (!factory) {
    throw new ConfigError(
      `Unknown column type '${config.type}' on '${name}'. ` +
      `Supported types: ${Object.keys(mapping.columnBuilders).join(', ')}`
    )
  }

  let col = factory(name, config)

  if (config.primaryKey) col = col.primaryKey()
  if (config.notNull)    col = col.notNull()

  // Defaults
  if (config.default === 'now') {
    col = col.defaultNow()
  } else if (config.default === 'random_uuid') {
    col = col.defaultRandom()
  } else if (config.default !== undefined) {
    col = col.default(config.default)
  }

  // User customization of the auto-built column
  if (config.custom) {
    col = config.custom(col)
  }

  return col
}
