import { describe, it, expectTypeOf } from 'vitest'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { pgTable, uuid, varchar, text as pgText, integer as pgInteger, timestamp, type PgDatabase } from 'drizzle-orm/pg-core'
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

// Soft-delete-enabled tables (have a `deletedAt` column). Used to verify that
// `softDelete: true` surfaces SoftDeleteCRUD on the store and ctx.
const sdUsersTable = sqliteTable('sd_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

const pgSdUsers = pgTable('pg_sd_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  deletedAt: timestamp('deleted_at'),
})

// A table with a column to hide. Used to verify that `hidden: true` omits the
// column from public row types (but not from inputs, and not from ctx CRUD).
const pgSecretUsers = pgTable('pg_secret_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull(),
  password: pgText('password').notNull(),
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

// ---------------------------------------------------------------------------
// 4a — Typed column keys in StoreConfig. `columns` keys are constrained to the
// table's columns: valid keys compile, typos are compile errors. These checks
// live in a never-invoked closure so tsc verifies them without the runtime
// `validateAnnotations` backstop throwing.
// ---------------------------------------------------------------------------
describe('StoreConfig typed column keys', () => {
  it('accepts real column keys and rejects typos at compile time', () => {
    const _typeOnly = () => {
      defineStore(usersTable, { columns: { email: { required: true }, name: { hidden: true } } })

      // @ts-expect-error - 'emial' is not a column of usersTable
      defineStore(usersTable, { columns: { emial: { required: true } } })
    }
    void _typeOnly
  })
})

// ---------------------------------------------------------------------------
// 4b — Soft-delete methods become visible to TypeScript. A store created with
// `softDelete: true` exposes SoftDeleteCRUD (restore / forceDestroy /
// forceDestroyAll / findWithDeleted / countWithDeleted); a plain store does not.
// Verified across both the multi-file (register) and simple (db.defineStore)
// paths, plus on ctx inside custom queries.
// ---------------------------------------------------------------------------
describe('soft-delete method visibility', () => {
  it('register() path: softDelete store exposes restore(), plain store does not', () => {
    const sdDef = defineStore(sdUsersTable, { softDelete: true }).queries({
      findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
    })
    type SdStore = InferStore<typeof sdDef>

    // restore() is present and typed (returns the row, takes a PK).
    expectTypeOf<SdStore['restore']>().toBeFunction()
    expectTypeOf<SdStore['restore']>().returns.resolves.not.toBeAny()
    expectTypeOf<SdStore['forceDestroyAll']>().returns.resolves.toEqualTypeOf<number>()
    expectTypeOf<SdStore['countWithDeleted']>().returns.resolves.toEqualTypeOf<number>()
    expectTypeOf<SdStore['findWithDeleted']>().returns.resolves.toBeArray()
    // Custom query still rides alongside the soft-delete surface.
    expectTypeOf<SdStore['findByEmail']>().parameter(0).toEqualTypeOf<string>()

    const plainDef = defineStore(usersTable)
    type PlainStore = InferStore<typeof plainDef>
    expectTypeOf<PlainStore>().not.toHaveProperty('restore')
    expectTypeOf<PlainStore>().not.toHaveProperty('forceDestroy')
    expectTypeOf<PlainStore>().not.toHaveProperty('findWithDeleted')

    // @ts-expect-error - a non-soft-delete store has no `restore` method
    type _NoRestore = PlainStore['restore']
  })

  it('simple path: db.defineStore({ softDelete: true }) exposes restore(), plain does not', () => {
    const _check = (db: StoriumInstance<'postgresql'>) => {
      const sd = db.defineStore(pgSdUsers, { softDelete: true })
      expectTypeOf<typeof sd>().toHaveProperty('restore')
      expectTypeOf(sd.restore).toBeFunction()
      expectTypeOf(sd.restore).returns.resolves.not.toBeAny()

      const plain = db.defineStore(pgUsers)
      expectTypeOf<typeof plain>().not.toHaveProperty('restore')

      // @ts-expect-error - plain store has no `forceDestroy`
      void plain.forceDestroy
    }
    void _check
  })

  it('ctx exposes soft-delete methods only when softDelete is enabled', () => {
    // Soft-delete store: ctx.restore / ctx.findWithDeleted are available.
    defineStore(pgSdUsers, { softDelete: true }).queries({
      revive: (ctx) => async (id: string) => {
        expectTypeOf(ctx.restore).toBeFunction()
        expectTypeOf(ctx.findWithDeleted).toBeFunction()
        const row = await ctx.restore(id)
        expectTypeOf(row).not.toBeAny()
        return row
      },
    })

    // Plain store: ctx has no soft-delete methods.
    defineStore(pgUsers).queries({
      probe: (ctx) => async () => {
        // @ts-expect-error - ctx.restore is not present without softDelete
        void ctx.restore
        return null
      },
    })
  })
})

// ---------------------------------------------------------------------------
// Hidden-column projection. `hidden: true` strips a column from SELECT results
// at runtime; the public row types now omit it too (via `PublicRow` /
// `HiddenKeys`). The `hidden: true` literal is captured by a `const` config type
// parameter on defineStore / db.defineStore. Inputs keep hidden columns (hidden
// implies writable); ctx CRUD keeps the full row (the `includeHidden` escape
// hatch lives there). QA-IDs start at 10407 to avoid colliding with the typed-
// mixin work (QA-10403..10406) on its own branch.
// ---------------------------------------------------------------------------
describe('hidden-column projection', () => {
  /* QA-10407 */ it('[QA-10407] register() path: hidden columns are omitted from public row types', () => {
    const def = defineStore(pgSecretUsers, { columns: { password: { hidden: true } } })
    type SecretStore = InferStore<typeof def>

    type FoundRow = NonNullable<Awaited<ReturnType<SecretStore['findOne']>>>
    expectTypeOf<FoundRow>().toHaveProperty('email')
    expectTypeOf<FoundRow>().not.toHaveProperty('password')

    // Write methods that return a row are projected too.
    type CreatedRow = Awaited<ReturnType<SecretStore['create']>>
    expectTypeOf<CreatedRow>().not.toHaveProperty('password')

    // @ts-expect-error - password is hidden, absent from the projected row type
    type _NoPw = CreatedRow['password']
  })

  /* QA-10408 */ it('[QA-10408] inputs still accept hidden columns (hidden implies writable)', () => {
    const def = defineStore(pgSecretUsers, { columns: { password: { hidden: true } } })
    type SecretStore = InferStore<typeof def>

    // create()'s input keeps the hidden column — only the returned row strips it.
    expectTypeOf<Parameters<SecretStore['create']>[0]>().toHaveProperty('password')
  })

  /* QA-10409 */ it('[QA-10409] simple path: db.defineStore omits hidden columns from row types', () => {
    const _check = (db: StoriumInstance<'postgresql'>) => {
      const u = db.defineStore(pgSecretUsers, { columns: { password: { hidden: true } } })
      void (async () => {
        const row = await u.findById('1')
        if (!row) return
        expectTypeOf(row).toHaveProperty('email')
        // @ts-expect-error - password is hidden at the type level
        void row.password
      })
    }
    void _check
  })

  /* QA-10410 */ it('[QA-10410] ctx CRUD keeps the full row (includeHidden escape hatch lives here)', () => {
    defineStore(pgSecretUsers, { columns: { password: { hidden: true } } }).queries({
      auth: (ctx) => async (email: string) => {
        // ctx is the internal surface: the row type still includes hidden columns,
        // and `includeHidden: true` actually returns them at runtime.
        const row = await ctx.findOne({ email }, { includeHidden: true })
        if (!row) return null
        expectTypeOf(row).toHaveProperty('password')
        return row
      },
    })
  })

  /* QA-10411 */ it('[QA-10411] stores with no hidden columns are unaffected (THidden = never)', () => {
    const def = defineStore(pgUsers)
    type PlainStore = InferStore<typeof def>
    type Row = NonNullable<Awaited<ReturnType<PlainStore['findOne']>>>

    // Full row preserved — Omit<…, never> is a no-op.
    expectTypeOf<Row>().toHaveProperty('email')
    expectTypeOf<Row>().toHaveProperty('age')
  })
})
