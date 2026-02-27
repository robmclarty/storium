/**
 * Fastify example — REST API with auto-generated JSON Schema validation
 *
 * Demonstrates:
 *  - toJsonSchema() for Fastify request/response schemas (compiled by Ajv)
 *  - DI pattern: storium stores decorated onto the Fastify instance
 *  - Full CRUD: GET list, GET by id, POST, PATCH, DELETE
 *  - Validation errors → HTTP 400 with structured error response
 *  - Transactions via POST /tasks/batch
 *  - Self-testing: starts server, exercises endpoints, prints results
 *
 * This example uses SQLite for zero-setup convenience.
 *
 * Run: npm start
 */

import { existsSync, unlinkSync, rmSync } from 'node:fs'
import Fastify from 'fastify'
import { storium } from 'storium'
import { generate, migrate, seed, loadConfig } from 'storium/migrate'
import { taskRoutes } from './routes/tasks.js'
import { tasksTable } from './entities/tasks/task.schema.js'

// --- Setup: database + migrations + Fastify ---

const dbPath = './data.db'
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })

const config = await loadConfig()
const db = storium.connect(config)
const stores = { tasks: db.defineStore(tasksTable) }

await generate()
await migrate(db)
await seed(db)

// --- Fastify app with DI ---

const fastify = Fastify({ logger: false })

// Decorate the instance so routes can access stores and db
fastify.decorate('stores', stores)
fastify.decorate('db', db)

// Register routes
await fastify.register(taskRoutes)

// Start the server
const address = await fastify.listen({ port: 0 }) // random port for self-test

// --- Self-test: exercise the API and print results ---

const base = address

const json = (r: Response) => r.json() as Promise<any>
const get = (path: string) => fetch(`${base}${path}`).then(json)
const post = (path: string, body: any) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const patch = (path: string, body: any) =>
  fetch(`${base}${path}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const del = (path: string) =>
  fetch(`${base}${path}`, { method: 'DELETE' })

// List all tasks (seeded)
const allTasks = await get('/tasks')

// Get one by ID
const first = allTasks[0]
const found = await get(`/tasks/${first.id}`)

// Create a new task
const createRes = await post('/tasks', { title: 'New task from API', priority: 10 })
const created = await json(createRes)

// Update it
const patchRes = await patch(`/tasks/${created.id}`, { status: 'done' })
const updated = await json(patchRes)

// Validation error — empty title
const badRes = await post('/tasks', { title: '' })
const badBody = await json(badRes)

// Batch create (transaction)
const batchRes = await post('/tasks/batch', [
  { title: 'Batch task 1', priority: 20 },
  { title: 'Batch task 2', priority: 21 },
])
const batch = await json(batchRes)

// Delete
const deleteRes = await del(`/tasks/${created.id}`)

// Final count
const finalTasks = await get('/tasks')

// --- Print results ---

console.log('=== List (seeded) ===')
console.log('Tasks:', allTasks.map((t: any) => t.title))

console.log('\n=== Get by ID ===')
console.log('Found:', found.title, `(${found.status})`)

console.log('\n=== Create ===')
console.log('Created:', created.title, `(priority: ${created.priority})`)

console.log('\n=== Update ===')
console.log('Updated:', updated.title, `→ ${updated.status}`)

console.log('\n=== Validation Error ===')
console.log('Status:', badRes.status)
console.log('Errors:', badBody.errors)

console.log('\n=== Batch Create (transaction) ===')
console.log('Batch:', batch.map((t: any) => t.title))

console.log('\n=== Delete ===')
console.log('Status:', deleteRes.status)

console.log('\n=== Final Count ===')
console.log(`${finalTasks.length} tasks remaining`)

// --- JSON Schema inspection ---

console.log('\n=== JSON Schemas ===')
console.log('Insert schema:', JSON.stringify(stores.tasks.schemas.insert.toJsonSchema(), null, 2))

// --- Teardown ---

await fastify.close()
await db.disconnect()
if (existsSync(dbPath)) unlinkSync(dbPath)
if (existsSync('./migrations')) rmSync('./migrations', { recursive: true })
console.log('\nDone!')
