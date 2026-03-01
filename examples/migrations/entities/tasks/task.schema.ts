import { defineTable } from 'storium'

// defineTable auto-detects the dialect from storium.config.ts
export const tasksTable = defineTable('tasks', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, required: true },
  description: { type: 'text' },
  status: { type: 'varchar', maxLength: 20, default: 'pending' },
  priority: { type: 'integer', default: 0 },
}, {
  timestamps: true,
  indexes: {
    status: {},
  },
})
