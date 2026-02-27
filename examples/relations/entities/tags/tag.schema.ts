import { defineTable } from 'storium'

export const tagsTable = defineTable('tags', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: { type: 'varchar', maxLength: 100, mutable: true, required: true },
}, {
  indexes: { name: { unique: true } },
})
