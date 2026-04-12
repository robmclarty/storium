import { defineStore } from 'storium'
import { authorsTable } from './author.schema.js'

export const authorStore = defineStore(authorsTable, {
  columns: {
    name: { required: true },
    email: { required: true },
  },
})
