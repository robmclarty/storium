import { defineTable } from 'storium'

export const authorsTable = defineTable('authors')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    name: { type: 'varchar', maxLength: 255, required: true },
    email: { type: 'varchar', maxLength: 255, required: true },
  })
  .indexes({ email: { unique: true } })
