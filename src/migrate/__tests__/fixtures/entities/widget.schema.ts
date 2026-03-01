import { buildDefineTable } from '../../../../core/defineTable'

const dt = buildDefineTable('memory')

export const widgetsTable = dt('widgets').columns({
  id: { type: 'uuid', primaryKey: true, default: 'uuid:v4' },
  label: { type: 'varchar', maxLength: 255, required: true },
}).timestamps(false)
