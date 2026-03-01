import { defineTable } from 'storium'

export const tasksTable = defineTable('tasks')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    title: {
      type: 'varchar',
      maxLength: 255,
      required: true,
      validate: (value, test) => {
        test(value, (v: any) => typeof v === 'string' && v.trim().length > 0, 'Title cannot be empty')
      },
    },
    description: { type: 'text' },
    status: { type: 'varchar', maxLength: 20, default: 'pending' },
    priority: { type: 'integer', default: 0 },
  })
  .indexes({ status: {} })
