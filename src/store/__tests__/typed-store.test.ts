import { describe, it, expectTypeOf } from 'vitest'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { defineStore } from '../define'

const usersTable = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  age: integer('age'),
})

describe('Store<TTable> type inference', () => {
  it('defineStore preserves the table type in StoreDefinition', () => {
    const store = defineStore(usersTable)
    expectTypeOf(store.tableDef).toEqualTypeOf<typeof usersTable>()
  })

  it('StoreDefinition.queries preserves table type', () => {
    const store = defineStore(usersTable).queries({
      findByEmail: (ctx) => async (email: string) => ctx.findOne({ email }),
    })
    expectTypeOf(store.tableDef).toEqualTypeOf<typeof usersTable>()
  })
})
