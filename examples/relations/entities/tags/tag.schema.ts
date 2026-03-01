import { defineTable } from 'storium'

export const tagsTable = defineTable('tags')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
    name: { type: 'varchar', maxLength: 100, required: true },
  })
  .indexes({ name: { unique: true } })
