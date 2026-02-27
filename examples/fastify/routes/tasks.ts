/**
 * Task CRUD routes.
 *
 * Demonstrates:
 *  - toJsonSchema() for Fastify request/response validation
 *  - Store CRUD operations in route handlers
 *  - Storium ValidationError → HTTP 400 mapping
 *  - Transactions for atomic multi-record operations
 */

import type { FastifyInstance } from 'fastify'
import { ValidationError } from 'storium'

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
}

export async function taskRoutes(fastify: FastifyInstance) {
  const { tasks } = fastify.stores

  // JSON Schemas generated from the storium table definition.
  // Fastify compiles these with Ajv for fast request/response validation.
  const insertSchema = tasks.schemas.createSchema.toJsonSchema()
  const updateSchema = tasks.schemas.updateSchema.toJsonSchema()
  const selectSchema = tasks.schemas.selectSchema.toJsonSchema()

  // --- GET /tasks ---

  fastify.get('/tasks', {
    schema: {
      response: { 200: { type: 'array', items: selectSchema } },
    },
  }, async () => {
    return tasks.findAll({ orderBy: { column: 'priority', direction: 'asc' } })
  })

  // --- GET /tasks/:id ---

  fastify.get('/tasks/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      response: { 200: selectSchema, 404: errorSchema },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const task = await tasks.findById(id)
    if (!task) return reply.code(404).send({ error: 'Task not found' })
    return task
  })

  // --- POST /tasks ---

  fastify.post('/tasks', {
    schema: {
      body: insertSchema,
      response: { 201: selectSchema, 400: errorSchema },
    },
  }, async (req, reply) => {
    try {
      const task = await tasks.create(req.body as any)
      return reply.code(201).send(task)
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.code(400).send({ errors: err.errors })
      }
      throw err
    }
  })

  // --- PATCH /tasks/:id ---

  fastify.patch('/tasks/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
      body: updateSchema,
      response: { 200: selectSchema, 400: errorSchema },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    try {
      const task = await tasks.update(id, req.body as any)
      return task
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.code(400).send({ errors: err.errors })
      }
      throw err
    }
  })

  // --- DELETE /tasks/:id ---

  fastify.delete('/tasks/:id', {
    schema: {
      params: {
        type: 'object',
        properties: { id: { type: 'string', format: 'uuid' } },
        required: ['id'],
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await tasks.destroy(id)
    return reply.code(204).send()
  })

  // --- POST /tasks/batch --- (transaction example)

  fastify.post('/tasks/batch', {
    schema: {
      body: { type: 'array', items: insertSchema },
      response: { 201: { type: 'array', items: selectSchema } },
    },
  }, async (req, reply) => {
    const items = req.body as any[]
    const created = await fastify.db.transaction(async (tx: any) => {
      const results = []
      for (const item of items) {
        results.push(await tasks.create(item, { tx }))
      }
      return results
    })
    return reply.code(201).send(created)
  })
}
