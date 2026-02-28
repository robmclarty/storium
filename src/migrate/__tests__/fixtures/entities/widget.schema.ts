import { buildDefineTable } from '../../../../core/defineTable'

const dt = buildDefineTable('memory')

export const widgetsTable = dt('widgets', {
  id: { type: 'uuid', primaryKey: true, default: 'random_uuid' },
  label: { type: 'varchar', maxLength: 255, mutable: true, required: true },
}, { timestamps: false })
