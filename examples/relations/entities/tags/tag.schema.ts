import { defineTable } from 'storium'

export const tagsTable = defineTable('tags')
  .columns({
    id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
    name: { type: 'varchar', maxLength: 100, required: true },
  })
  .indexes({ name: { unique: true } })
