/**
 * Temporary PostgreSQL database for demo purposes.
 *
 * This file is NOT part of a typical storium application. It uses
 * Testcontainers to spin up a disposable PostgreSQL instance inside Docker
 * so the example can run without any external database setup.
 *
 * In a real app you would simply set DATABASE_URL in your environment and
 * import your storium.config.ts directly — no container management needed.
 *
 * Requirements: Docker must be running on your machine.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import type { StoriumConfig } from 'storium'

export type TemporaryDatabase = {
  config: StoriumConfig
  stop: () => Promise<void>
}

/**
 * Start a disposable PostgreSQL 16 container and return a storium-compatible
 * config object. Call `stop()` when you're done to tear down the container.
 */
export async function startTemporaryDatabase(): Promise<TemporaryDatabase> {
  console.log('Starting PostgreSQL container (requires Docker)...')

  let container
  try {
    container = await new PostgreSqlContainer('postgres:16-alpine').start()
  } catch {
    console.error(
      '\nError: Could not start PostgreSQL container.\n\n' +
      'Make sure Docker is installed and running on your machine.\n' +
      '  - Install Docker: https://docs.docker.com/get-docker/\n' +
      '  - Then run: docker info (to verify it\'s running)\n'
    )
    process.exit(1)
  }

  console.log('Container started.')

  // Set DATABASE_URL so storium.config.ts can read it. In a real app this
  // would already be set in your environment or .env file.
  process.env.DATABASE_URL = container.getConnectionUri()

  // Import config lazily — after DATABASE_URL is set, so the connection
  // string resolves correctly.
  const { default: config } = await import('./storium.config.js')

  return {
    config,
    stop: () => container.stop(),
  }
}
