import { defineSeed } from '../../../seed'

export default defineSeed(async (db) => {
  const { widgets } = db.stores
  await widgets.create({ id: 'w1', label: 'Sprocket' })
  await widgets.create({ id: 'w2', label: 'Cog' })
})
