#!/usr/bin/env node

/**
 * Storium CLI
 *
 * Usage:
 *   npx storium generate   — Diff schemas → create migration SQL file
 *   npx storium migrate    — Apply pending migrations
 *   npx storium push       — Push schema directly to DB (dev only)
 *   npx storium status     — Show pending migrations
 *   npx storium seed       — Run seed files
 *
 * Reads configuration from drizzle.config.ts in the project root,
 * or a path specified via --config.
 */

import { register } from 'node:module'

// Register tsx as a loader so we can import .ts config and schema files.
// tsx is expected as a devDependency in the user's project.
try {
  register('tsx/esm', import.meta.url)
} catch {
  // tsx not installed — .ts imports will fail with a clear error in loadConfig
}

import { generate, migrate, push, status } from '../src/migrate/commands'
import { seed } from '../src/migrate/seed'
import { connect } from '../src/connect'
import { loadConfig } from '../src/core/configLoader'

// --------------------------------------------------------------- Helpers --

const COMMANDS = ['generate', 'migrate', 'push', 'status', 'seed'] as const
type Command = (typeof COMMANDS)[number]

const usage = () => {
  console.log(`
  storium — Lightweight storage abstraction CLI

  Usage:
    npx storium <command> [options]

  Commands:
    generate    Diff schemas → create migration SQL file
    migrate     Apply pending migrations
    push        Push schema directly to DB (dev only)
    status      Show pending migration status
    seed        Run seed files

  Options:
    --config <path>   Path to config file (default: storium.config.ts or drizzle.config.ts)
    --help            Show this help message
`)
}

/**
 * Parse CLI arguments.
 */
const parseArgs = (argv: string[]) => {
  const args = argv.slice(2)
  const command = args[0] as Command | undefined

  const configIdx = args.indexOf('--config')
  const configArg = args[configIdx + 1]
  const configPath = configIdx !== -1 && configArg ? configArg : undefined

  const help = args.includes('--help') || args.includes('-h')

  return { command, configPath, help }
}

// ---------------------------------------------------------------- Main --

const main = async () => {
  const { command, configPath, help } = parseArgs(process.argv)

  if (help || !command) {
    usage()
    process.exit(help ? 0 : 1)
  }

  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: '${command}'`)
    usage()
    process.exit(1)
  }

  // Propagate --config to all layers via env var so resolveConfigPath()
  // picks it up in generate()/push() when shelling out to drizzle-kit.
  if (configPath) {
    process.env.STORIUM_CONFIG = configPath
  }

  const config = await loadConfig(configPath)

  switch (command) {
    case 'generate': {
      const result = await generate(config)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'migrate': {
      const db = connect(config)
      try {
        const result = await migrate(db, config)
        console.log(result.message)
        process.exit(result.success ? 0 : 1)
      } finally {
        await db.disconnect()
      }
      break
    }

    case 'push': {
      const result = await push(config)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'status': {
      const result = await status(config)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'seed': {
      const db = connect(config)
      try {
        const result = await seed(db, config)
        console.log(result.message)
        process.exit(result.success ? 0 : 1)
      } finally {
        await db.disconnect()
      }
      break
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err.message ?? err)
  process.exit(1)
})
