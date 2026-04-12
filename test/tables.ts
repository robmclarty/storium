/**
 * Dialect-aware table definitions for multi-dialect testing.
 *
 * Each factory returns Drizzle table objects for the specified dialect.
 * Tables are structurally identical across dialects, using each dialect's
 * native column types.
 */

import type { Dialect } from 'storium'

// Dialect-specific imports
import { sqliteTable, text as sqliteText, integer as sqliteInt, primaryKey as sqlitePK } from 'drizzle-orm/sqlite-core'
import { pgTable, uuid, varchar, text as pgText, integer as pgInt, timestamp, primaryKey as pgPK } from 'drizzle-orm/pg-core'
import { mysqlTable, varchar as mysqlVarchar, text as mysqlText, int as mysqlInt, timestamp as mysqlTimestamp, primaryKey as mysqlPK } from 'drizzle-orm/mysql-core'

// -------------------------------------------------------- Users Table --

const sqliteUsers = sqliteTable('users', {
  id: sqliteText('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: sqliteText('email').notNull(),
  name: sqliteText('name'),
  password_hash: sqliteText('password_hash'),
})

const pgUsers = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  password_hash: pgText('password_hash'),
})

const mysqlUsers = mysqlTable('users', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: mysqlVarchar('email', { length: 255 }).notNull(),
  name: mysqlVarchar('name', { length: 255 }),
  password_hash: mysqlText('password_hash'),
})

// -------------------------------------------------------- Posts Table --

const sqlitePosts = sqliteTable('posts', {
  id: sqliteText('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: sqliteText('title').notNull(),
  author_id: sqliteText('author_id').notNull(),
})

const pgPosts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  author_id: uuid('author_id').notNull(),
})

const mysqlPosts = mysqlTable('posts', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: mysqlVarchar('title', { length: 255 }).notNull(),
  author_id: mysqlVarchar('author_id', { length: 36 }).notNull(),
})

// ------------------------------------------------ Memberships Table --
// (composite primary key)

const sqliteMemberships = sqliteTable('memberships', {
  user_id: sqliteText('user_id').notNull(),
  group_id: sqliteText('group_id').notNull(),
  role: sqliteText('role'),
}, (table) => [
  sqlitePK({ columns: [table.user_id, table.group_id] }),
])

const pgMemberships = pgTable('memberships', {
  user_id: uuid('user_id').notNull(),
  group_id: uuid('group_id').notNull(),
  role: varchar('role', { length: 50 }),
}, (table) => [
  pgPK({ columns: [table.user_id, table.group_id] }),
])

const mysqlMemberships = mysqlTable('memberships', {
  user_id: mysqlVarchar('user_id', { length: 36 }).notNull(),
  group_id: mysqlVarchar('group_id', { length: 36 }).notNull(),
  role: mysqlVarchar('role', { length: 50 }),
}, (table) => [
  mysqlPK({ columns: [table.user_id, table.group_id] }),
])

// ------------------------------------------ Soft-Delete Users Table --

const sqliteSoftDeleteUsers = sqliteTable('soft_delete_users', {
  id: sqliteText('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: sqliteText('email').notNull(),
  name: sqliteText('name'),
  deletedAt: sqliteInt('deleted_at', { mode: 'timestamp' }),
})

const pgSoftDeleteUsers = pgTable('soft_delete_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  deletedAt: timestamp('deleted_at'),
})

const mysqlSoftDeleteUsers = mysqlTable('soft_delete_users', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: mysqlVarchar('email', { length: 255 }).notNull(),
  name: mysqlVarchar('name', { length: 255 }),
  deletedAt: mysqlTimestamp('deleted_at'),
})

// -------------------------------------------------------- Profiles Table --

const sqliteProfiles = sqliteTable('profiles', {
  id: sqliteText('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: sqliteText('user_id').notNull(),
  bio: sqliteText('bio'),
})

const pgProfiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  bio: pgText('bio'),
})

const mysqlProfiles = mysqlTable('profiles', {
  id: mysqlVarchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: mysqlVarchar('user_id', { length: 36 }).notNull(),
  bio: mysqlText('bio'),
})

// ----------------------------------------------- Team Members Table --
// (composite primary key with role for withMembers testing)

const sqliteTeamMembers = sqliteTable('team_members', {
  team_id: sqliteText('team_id').notNull(),
  member_id: sqliteText('member_id').notNull(),
  role: sqliteText('role'),
}, (table) => [
  sqlitePK({ columns: [table.team_id, table.member_id] }),
])

const pgTeamMembers = pgTable('team_members', {
  team_id: uuid('team_id').notNull(),
  member_id: uuid('member_id').notNull(),
  role: varchar('role', { length: 50 }),
}, (table) => [
  pgPK({ columns: [table.team_id, table.member_id] }),
])

const mysqlTeamMembers = mysqlTable('team_members', {
  team_id: mysqlVarchar('team_id', { length: 36 }).notNull(),
  member_id: mysqlVarchar('member_id', { length: 36 }).notNull(),
  role: mysqlVarchar('role', { length: 50 }),
}, (table) => [
  mysqlPK({ columns: [table.team_id, table.member_id] }),
])

// -------------------------------------------------------- DDL --

/** SQL DDL for creating test tables. Dialect-specific syntax. */
export const ddl: Record<string, Record<string, string>> = {
  memory: {
    users: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      password_hash TEXT
    )`,
    posts: `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author_id TEXT NOT NULL
    )`,
    memberships: `CREATE TABLE IF NOT EXISTS memberships (
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      role TEXT,
      PRIMARY KEY (user_id, group_id)
    )`,
    soft_delete_users: `CREATE TABLE IF NOT EXISTS soft_delete_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      name TEXT,
      deleted_at INTEGER
    )`,
    profiles: `CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      bio TEXT
    )`,
    team_members: `CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL,
      member_id TEXT NOT NULL,
      role TEXT,
      PRIMARY KEY (team_id, member_id)
    )`,
  },
  postgresql: {
    users: `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      password_hash TEXT
    )`,
    posts: `CREATE TABLE IF NOT EXISTS posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      author_id UUID NOT NULL
    )`,
    memberships: `CREATE TABLE IF NOT EXISTS memberships (
      user_id UUID NOT NULL,
      group_id UUID NOT NULL,
      role VARCHAR(50),
      PRIMARY KEY (user_id, group_id)
    )`,
    soft_delete_users: `CREATE TABLE IF NOT EXISTS soft_delete_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      deleted_at TIMESTAMP
    )`,
    profiles: `CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      bio TEXT
    )`,
    team_members: `CREATE TABLE IF NOT EXISTS team_members (
      team_id UUID NOT NULL,
      member_id UUID NOT NULL,
      role VARCHAR(50),
      PRIMARY KEY (team_id, member_id)
    )`,
  },
  mysql: {
    users: `CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      password_hash TEXT
    )`,
    posts: `CREATE TABLE IF NOT EXISTS posts (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      author_id VARCHAR(36) NOT NULL
    )`,
    memberships: `CREATE TABLE IF NOT EXISTS memberships (
      user_id VARCHAR(36) NOT NULL,
      group_id VARCHAR(36) NOT NULL,
      role VARCHAR(50),
      PRIMARY KEY (user_id, group_id)
    )`,
    soft_delete_users: `CREATE TABLE IF NOT EXISTS soft_delete_users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255),
      deleted_at TIMESTAMP NULL
    )`,
    profiles: `CREATE TABLE IF NOT EXISTS profiles (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      bio TEXT
    )`,
    team_members: `CREATE TABLE IF NOT EXISTS team_members (
      team_id VARCHAR(36) NOT NULL,
      member_id VARCHAR(36) NOT NULL,
      role VARCHAR(50),
      PRIMARY KEY (team_id, member_id)
    )`,
  },
}

// ------------------------------------------------ Table Getters --

type TestTables = {
  users: any
  posts: any
  memberships: any
  softDeleteUsers: any
  profiles: any
  teamMembers: any
}

/** Get Drizzle table objects for the specified dialect. */
export function getTables(dialect: Dialect): TestTables {
  switch (dialect) {
    case 'memory':
    case 'sqlite':
      return {
        users: sqliteUsers,
        posts: sqlitePosts,
        memberships: sqliteMemberships,
        softDeleteUsers: sqliteSoftDeleteUsers,
        profiles: sqliteProfiles,
        teamMembers: sqliteTeamMembers,
      }
    case 'postgresql':
      return {
        users: pgUsers,
        posts: pgPosts,
        memberships: pgMemberships,
        softDeleteUsers: pgSoftDeleteUsers,
        profiles: pgProfiles,
        teamMembers: pgTeamMembers,
      }
    case 'mysql':
      return {
        users: mysqlUsers,
        posts: mysqlPosts,
        memberships: mysqlMemberships,
        softDeleteUsers: mysqlSoftDeleteUsers,
        profiles: mysqlProfiles,
        teamMembers: mysqlTeamMembers,
      }
    default:
      throw new Error(`Unknown dialect: ${dialect}`)
  }
}

/** Get DDL statements for the specified dialect. */
export function getDDL(dialect: Dialect): Record<string, string> {
  const key = dialect === 'sqlite' ? 'memory' : dialect
  return ddl[key] ?? ddl.memory
}
