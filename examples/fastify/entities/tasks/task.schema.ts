import { defineTable } from 'storium'

export const tasksTable = defineTable('tasks', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  title: {
    type: 'varchar',
    maxLength: 255,
    mutable: true,
    required: true,
    validate: (value, test) => {
      test(value, (v: any) => typeof v === 'string' && v.trim().length > 0, 'Title cannot be empty')
    },
  },
  description: { type: 'text', mutable: true },
  status: { type: 'varchar', maxLength: 20, mutable: true, default: 'pending' },
  priority: { type: 'integer', mutable: true, default: 0 },
}, {
  timestamps: true,
  indexes: {
    status: {},
  },
})
