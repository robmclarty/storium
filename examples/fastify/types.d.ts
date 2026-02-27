import type { StoriumInstance } from 'storium'

declare module 'fastify' {
  interface FastifyInstance {
    stores: Record<string, any>
    db: StoriumInstance
  }
}
