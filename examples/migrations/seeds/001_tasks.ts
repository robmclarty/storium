import { defineSeed } from 'storium/migrate'

export default defineSeed(async (db) => {
  const { tasks } = db.stores

  await tasks.create({
    title: 'Set up the database',
    description: 'Configure storium and run initial migrations.',
    status: 'done',
    priority: 1,
  })

  await tasks.create({
    title: 'Write schema files',
    description: 'Define tables using defineTable().',
    status: 'done',
    priority: 2,
  })

  await tasks.create({
    title: 'Generate migrations',
    description: 'Run `npx storium generate` to create SQL migration files.',
    status: 'in_progress',
    priority: 3,
  })

  await tasks.create({
    title: 'Deploy to production',
    description: 'Run `npx storium migrate` in CI/CD pipeline.',
    status: 'pending',
    priority: 4,
  })
})
