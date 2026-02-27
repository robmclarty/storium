import { defineSeed } from 'storium/migrate'

export default defineSeed(async (db) => {
  const { tasks } = db.stores

  await tasks.create({
    title: 'Set up the project',
    description: 'Initialize storium with Fastify.',
    status: 'done',
    priority: 1,
  })

  await tasks.create({
    title: 'Add JSON Schema validation',
    description: 'Use toJsonSchema() on Fastify routes.',
    status: 'in_progress',
    priority: 2,
  })

  await tasks.create({
    title: 'Write tests',
    description: 'Cover all CRUD endpoints.',
    status: 'pending',
    priority: 3,
  })
})
