/**
 * Migrations example — full lifecycle with programmatic API
 *
 * Demonstrates:
 *  - Programmatic migration workflow: generate → status → migrate → seed
 *  - All steps use auto-loaded config from storium.config.ts
 *  - Equivalent CLI commands shown in comments for comparison
 *  - Seeds with auto-discovered stores
 *
 * This example uses SQLite for zero-setup convenience.
 * The same workflow applies to PostgreSQL and MySQL.
 *
 * Run: npm start
 *
 * CLI equivalents (see package.json scripts):
 *   npm run generate    →  npx storium generate
 *   npm run migrate     →  npx storium migrate
 *   npm run seed        →  npx storium seed
 *   npm run status      →  npx storium status
 */

import { existsSync, unlinkSync, rmSync } from 'node:fs'
import { storium } from 'storium'
import { generate, migrate, seed, status, loadConfig } from 'storium/migrate'

// --- Clean slate ---

const dbPath = './data.db'
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })

// --- Migration lifecycle ---
// All functions auto-load storium.config.ts. Only migrate() and seed()
// need a live DB connection — the rest are file-level operations.

const beforeStatus = await status()                   // CLI: npx storium status
const gen = await generate()                          // CLI: npx storium generate
const afterStatus = await status()                    // CLI: npx storium status

const config = await loadConfig()
const db = storium.connect(config)

const mig = await migrate(db)                         // CLI: npx storium migrate
const seeded = await seed(db)                         // CLI: npx storium seed

// --- Results ---

console.log('=== Status (before generate) ===')
console.log(beforeStatus.message)

console.log('\n=== Generate ===')
console.log(gen.message)

console.log('\n=== Status (after generate) ===')
console.log(afterStatus.message)

console.log('\n=== Migrate ===')
console.log(mig.message)

console.log('\n=== Seed ===')
console.log(seeded.message)

// --- Verify the data ---

console.log('\n=== Verify ===')

const { tasks } = db.register({
  tasks: (await import('./entities/tasks/task.store.js')).taskStore,
})

const allTasks = await tasks.findAll({
  orderBy: { column: 'priority', direction: 'asc' },
})

for (const task of allTasks) {
  const icon = task.status === 'done' ? '[x]'
    : task.status === 'in_progress' ? '[~]'
    : '[ ]'
  console.log(`  ${icon} ${task.title} (priority: ${task.priority})`)
}

console.log(`\nTotal: ${allTasks.length} tasks`)

// --- Teardown ---

await db.disconnect()
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })
console.log('\nDone!')
