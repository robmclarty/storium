import { defineStore } from 'storium'
import { tasksTable } from './task.table.js'

export const taskStore = defineStore(tasksTable, {
  columns: {
    title: { required: true },
  },
})
