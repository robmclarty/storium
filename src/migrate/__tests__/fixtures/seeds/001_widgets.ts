import { defineSeed } from '../../../seed'

export default defineSeed(async (db) => {
  const { widgets } = db.stores
  await widgets.create({ label: 'Sprocket' })
  await widgets.create({ label: 'Cog' })
})
