import { MySqlContainer } from '@testcontainers/mysql'
import type { StoriumConfig } from 'storium'

export type TemporaryDatabase = {
  config: StoriumConfig
  stop: () => Promise<void>
}

export async function startTemporaryDatabase(): Promise<TemporaryDatabase> {
  console.log('Starting MySQL container (requires Docker)...')

  let container
  try {
    container = await new MySqlContainer('mysql:8').start()
  } catch {
    console.error(
      '\nError: Could not start MySQL container.\n\n' +
      'Make sure Docker is installed and running on your machine.\n' +
      '  - Install Docker: https://docs.docker.com/get-docker/\n' +
      '  - Then run: docker info (to verify it\'s running)\n'
    )
    process.exit(1)
  }

  console.log('Container started.')

  process.env.DATABASE_URL = container.getConnectionUri()
  const { default: config } = await import('./drizzle.config.js')

  return {
    config,
    stop: () => container.stop(),
  }
}
