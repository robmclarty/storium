import { defineStore } from 'storium'
import { usersTable } from './user.table.js'
import { findByEmail, search, authenticate } from './user.queries.js'

export const userStore = defineStore(usersTable, {
  columns: {
    email: {
      required: true,
      transform: (v: string) => v.trim().toLowerCase(),
      validate: (v, test) => {
        test(v, (val) => String(val).length > 0, 'Email cannot be empty')
      },
    },
    password_hash: { hidden: true },
  },
}).queries({ findByEmail, search, authenticate })
