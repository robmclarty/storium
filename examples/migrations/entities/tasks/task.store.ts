import { defineStore } from 'storium'
import { tasksTable } from './task.schema.js'

export const taskStore = defineStore(tasksTable)
