import { defineStore } from 'storium'
import { usersTable } from './user.schema.js'
import { findByEmail, search, authenticate } from './user.queries.js'

export const userStore = defineStore(usersTable).queries({ findByEmail, search, authenticate })
