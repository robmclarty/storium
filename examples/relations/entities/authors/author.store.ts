import { defineStore } from 'storium'
import { authorsTable } from './author.table.js'

export const authorStore = defineStore(authorsTable, {
  columns: {
    name: { required: true },
    email: { required: true },
  },
})
