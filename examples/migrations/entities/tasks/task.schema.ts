import { defineTable } from 'storium'

// defineTable auto-detects the dialect from storium.config.ts
export const tasksTable = defineTable('tasks', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  description: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, default: 'pending' },
  priority: { type: 'integer', mutable: true, default: 0 },
}, {
  timestamps: true,
  indexes: {
    status: {},
  },
})
