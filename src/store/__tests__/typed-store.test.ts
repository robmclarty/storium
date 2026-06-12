import { describe, it, expectTypeOf } from 'vitest'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { pgTable, uuid, varchar, integer as pgInteger, type PgDatabase } from 'drizzle-orm/pg-core'
import { defineStore } from '../define'
import type { InferStore, StoriumInstance, Promisable } from '../../types'

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  age: integer('age'),
})

// A PG table — its flavor pins the dialect, so multi-file ctx.drizzle should
// resolve to a concrete PgDatabase even before a connection exists.
const pgUsers = pgTable('pg_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  age: pgInteger('age'),
})

describe('Store<TTable> type inference', () => {
  /* QA-10297 */ it('[QA-10297] defineStore preserves the table type in StoreDefinition', () => {
    const store = defineStore(usersTable)
    expectTypeOf(store.tableDef).toEqualTypeOf<typeof usersTable>()
  })

  /* QA-10298 */ it('[QA-10298] StoreDefinition.queries preserves table type', () => {
    const store = defineStore(usersTable).queries({
      findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
    })
    expectTypeOf(store.tableDef).toEqualTypeOf<typeof usersTable>()
  })
})

// ---------------------------------------------------------------------------
// Multi-file pattern: defineStore().queries() — ctx is typed from the table
// flavor (InferTableDialect), and custom query signatures survive register().
// These run at runtime trivially: the query factory is stored, never invoked,
// so the in-factory expectTypeOf assertions are checked by tsc, not executed.
// ---------------------------------------------------------------------------
describe('multi-file ctx inference', () => {
  it('ctx.drizzle resolves to a concrete Drizzle class (not any) from the table flavor', () => {
    defineStore(pgUsers).queries({
      probe: (ctx) => async () => {
        expectTypeOf(ctx.drizzle).not.toBeAny()
        expectTypeOf(ctx.drizzle).toEqualTypeOf<PgDatabase<any, any, any>>()
        return null
      },
    })
  })

  it('ctx CRUD row types are inferred (not any)', () => {
    defineStore(pgUsers).queries({
      probe: (ctx) => async (email: string) => {
        const row = await ctx.findOne({ email })
        expectTypeOf(row).not.toBeAny()
        // Non-null branch has the inferred select columns.
        expectTypeOf(row!.email).toEqualTypeOf<string>()
        return row
      },
    })
  })

  it('ctx CRUD where-callback receives the typed table (not any)', () => {
    defineStore(pgUsers).queries({
      probe: (ctx) => async () => {
        return ctx.find({}, {
          where: (t) => {
            expectTypeOf(t).not.toBeAny()
            expectTypeOf(t.email).not.toBeAny()
            return undefined
          },
        })
      },
    })
  })

  it('ctx.schemas.createSchema.validate() returns a typed object (not any)', () => {
    defineStore(pgUsers).queries({
      probe: (ctx) => async () => {
        const data = ctx.schemas.createSchema.validate({})
        expectTypeOf(data).not.toBeAny()
        return data
      },
    })
  })

  it('custom query signature survives onto the live store via register()', () => {
    const def = defineStore(usersTable).queries({
      findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
      countActive: (ctx) => async (minAge: number, flag: boolean) => ctx.count({ age: minAge, name: String(flag) }),
    })

    // InferStore<T> is exactly what db.register() returns for each key, so this
    // exercises the same type path without needing a live connection.
    type UsersStore = InferStore<typeof def>

    expectTypeOf<UsersStore['findByEmail']>().parameter(0).toEqualTypeOf<string>()
    expectTypeOf<UsersStore['findByEmail']>().returns.resolves.not.toBeAny()

    expectTypeOf<UsersStore['countActive']>().parameter(0).toEqualTypeOf<number>()
    expectTypeOf<UsersStore['countActive']>().parameter(1).toEqualTypeOf<boolean>()
    expectTypeOf<UsersStore['countActive']>().returns.resolves.toEqualTypeOf<number>()

    // Default CRUD is still present and typed alongside customs.
    expectTypeOf<UsersStore['findById']>().returns.resolves.not.toBeAny()
  })
})

// ---------------------------------------------------------------------------
// Simple path: db.defineStore().queries(). The instance knows the dialect (D),
// so ctx is RepositoryContext<D, TTable>. This function is type-checked by tsc
// (tsconfig.check.json includes test files) but never called — db is a param,
// so no runtime connection is made.
// ---------------------------------------------------------------------------
describe('simple-path ctx inference', () => {
  it('binds dialect + table into ctx and preserves the custom query signature', () => {
    const _check = (db: StoriumInstance<'postgresql'>) => {
      const liveUsers = db.defineStore(pgUsers).queries({
        search: (ctx) => async (term: string) => {
          expectTypeOf(ctx.drizzle).not.toBeAny()
          expectTypeOf(ctx.drizzle).toEqualTypeOf<PgDatabase<any, any, any>>()
          const row = await ctx.findOne({ email: term })
          expectTypeOf(row).not.toBeAny()
          return row
        },
      })

      expectTypeOf(liveUsers.search).parameter(0).toEqualTypeOf<string>()
      expectTypeOf(liveUsers.search).returns.resolves.not.toBeAny()
      return liveUsers
    }
    void _check
  })
})

// ---------------------------------------------------------------------------
// Public store API + instance surface.
// ---------------------------------------------------------------------------
describe('public surface inference', () => {
  it('public store row types and where-callback table are typed (not any)', () => {
    const _check = (db: StoriumInstance<'postgresql'>) => {
      const users = db.defineStore(pgUsers)

      void (async () => {
        const row = await users.findOne({ email: 'x' })
        expectTypeOf(row).not.toBeAny()

        await users.find({}, {
          where: (t) => {
            expectTypeOf(t).not.toBeAny()
            return undefined
          },
        })

        const created = users.schemas.createSchema.validate({})
        expectTypeOf(created).not.toBeAny()
      })
    }
    void _check
  })

  it('transaction handle is typed (not any)', () => {
    const _check = (db: StoriumInstance<'postgresql'>) => {
      return db.transaction(async (tx) => {
        expectTypeOf(tx).not.toBeAny()
        return tx
      })
    }
    void _check
  })
})

describe('Promisable<T>', () => {
  it('round-trips T (not Promise<any>)', () => {
    expectTypeOf<Promisable<number>>().toEqualTypeOf<number | Promise<number>>()
  })
})
