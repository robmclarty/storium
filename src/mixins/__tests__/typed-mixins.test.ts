import { describe, it, expectTypeOf } from 'vitest'
import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core'
import { defineStore } from '../../store/define'
import { belongsTo } from '../belongsTo'
import { hasMany } from '../hasMany'
import { hasOne } from '../hasOne'
import { withMembers } from '../withMembers'
import type { InferStore } from '../../types'

// ---------------------------------------------------------------------------
// Typed mixin results. `belongsTo` / `hasMany` / `hasOne` / `withMembers` used
// to type their method *names* via template literals but return `Promise<any>`.
// They now derive the join/related row from the related table type + alias +
// `select` tuple. These checks are verified by tsc (tsconfig.check.json includes
// src/**/__tests__); the query factories are never invoked at runtime, so the
// stores are constructed but their methods are only inspected at the type level.
//
// pg flavor is used so column nullability is unambiguous: `notNull()` → `T`,
// nullable → `T | null`.
// ---------------------------------------------------------------------------

const authorsTable = pgTable('authors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
})

const postsTable = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  author_id: uuid('author_id').notNull(),
})

const profilesTable = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull(),
  bio: varchar('bio', { length: 500 }), // nullable → string | null
})

const teamMembersTable = pgTable('team_members', {
  team_id: uuid('team_id').notNull(),
  member_id: uuid('member_id').notNull(),
  role: varchar('role', { length: 50 }), // nullable → string | null
})

// Base stores attach `.storium` to each table, so the related `.table` carries
// the metadata the mixins read at construction time.
const authorStore = defineStore(authorsTable)
const postStore = defineStore(postsTable)
const profileStore = defineStore(profilesTable)
const teamMemberStore = defineStore(teamMembersTable)

// belongsTo: posts → author, related columns narrowed to ['name', 'email'].
const postWithAuthorDef = defineStore(postsTable).queries({
  ...belongsTo(authorStore.table, 'author_id', { alias: 'author', select: ['name', 'email'] }),
})
type PostWithAuthorStore = InferStore<typeof postWithAuthorDef>

// hasMany: author → posts, related columns narrowed to ['title'].
const authorWithPostsDef = defineStore(authorsTable).queries({
  ...hasMany(postStore.table, 'author_id', { alias: 'posts', select: ['title'] }),
})
type AuthorWithPostsStore = InferStore<typeof authorWithPostsDef>

// hasOne: user → profile, all related columns.
const userWithProfileDef = defineStore(authorsTable).queries({
  ...hasOne(profileStore.table, 'user_id', { alias: 'profile' }),
})
type UserWithProfileStore = InferStore<typeof userWithProfileDef>

// withMembers: team ↔ members via the join table.
const teamDef = defineStore(authorsTable).queries({
  ...withMembers(teamMemberStore.table, 'team_id'),
})
type TeamStore = InferStore<typeof teamDef>

describe('typed mixin results', () => {
  /* QA-10403 */ it('[QA-10403] belongsTo returns alias-prefixed related columns, typed (not Promise<any>)', () => {
    type Join = Awaited<ReturnType<PostWithAuthorStore['findWithAuthor']>>

    // The whole result is no longer `any`.
    expectTypeOf<PostWithAuthorStore['findWithAuthor']>().returns.resolves.not.toBeAny()

    // Selected related columns are prefixed by the alias and carry their types.
    expectTypeOf<NonNullable<Join>['author_name']>().not.toBeAny()
    expectTypeOf<NonNullable<Join>['author_name']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<Join>['author_email']>().toEqualTypeOf<string>()
  })

  /* QA-10404 */ it('[QA-10404] hasMany returns an array of typed related rows', () => {
    expectTypeOf<AuthorWithPostsStore['findPostsFor']>().returns.resolves.toBeArray()
    expectTypeOf<AuthorWithPostsStore['findPostsFor']>().returns.resolves.items.not.toBeAny()
    // `select: ['title']` narrows the row to exactly the chosen column.
    expectTypeOf<AuthorWithPostsStore['findPostsFor']>().returns.resolves.items.toEqualTypeOf<{ title: string }>()
  })

  /* QA-10405 */ it('[QA-10405] hasOne returns a single typed related row or null', () => {
    type Profile = Awaited<ReturnType<UserWithProfileStore['findProfileFor']>>

    expectTypeOf<UserWithProfileStore['findProfileFor']>().returns.resolves.not.toBeAny()
    // No `select` → all related columns, with their nullability preserved.
    expectTypeOf<NonNullable<Profile>['user_id']>().toEqualTypeOf<string>()
    expectTypeOf<NonNullable<Profile>['bio']>().toEqualTypeOf<string | null>()
  })

  /* QA-10406 */ it('[QA-10406] withMembers ops are typed against the join row', () => {
    type Added = Awaited<ReturnType<TeamStore['addMember']>>
    type Members = Awaited<ReturnType<TeamStore['getMembers']>>

    // addMember / getMembers surface the join row, not `any`.
    expectTypeOf<Added>().not.toBeAny()
    expectTypeOf<Added['team_id']>().toEqualTypeOf<string>()
    expectTypeOf<Added['role']>().toEqualTypeOf<string | null>()
    expectTypeOf<Members>().toBeArray()
    expectTypeOf<Members[number]['member_id']>().toEqualTypeOf<string>()

    // Scalar/void ops keep their natural return types.
    expectTypeOf<TeamStore['isMember']>().returns.resolves.toEqualTypeOf<boolean>()
    expectTypeOf<TeamStore['getMemberCount']>().returns.resolves.toEqualTypeOf<number>()
    expectTypeOf<TeamStore['removeMember']>().returns.resolves.toEqualTypeOf<void>()
  })
})
