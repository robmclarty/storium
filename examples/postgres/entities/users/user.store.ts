import { defineStore } from 'storium'
import { usersTable } from './user.schema.js'
import { findByEmail, search } from './user.queries.js'

export const userStore = defineStore(usersTable, { findByEmail, search })
