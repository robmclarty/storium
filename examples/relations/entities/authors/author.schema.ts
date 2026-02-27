import { defineTable } from 'storium'

export const authorsTable = defineTable('authors', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  name: { type: 'varchar', maxLength: 255, mutable: true, required: true },
  email: { type: 'varchar', maxLength: 255, mutable: true, required: true },
}, {
  indexes: { email: { unique: true } },
})
