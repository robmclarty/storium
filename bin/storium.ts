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
 * Reads configuration from storium.config.ts in the project root,
 * or a path specified via --config.
 */

import path from 'node:path'
import { generate, migrate, push, status } from '../src/migrate/commands'
import { runSeeds } from '../src/migrate/seed'
import { connect } from '../src/connect'
import type { StoriumConfig } from '../src/core/types'

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
    --config <path>   Path to config file (default: ./storium.config.ts)
    --help            Show this help message
`)
}

/**
 * Load the Storium config file.
 */
const loadConfig = async (configPath: string): Promise<StoriumConfig> => {
  const abs = path.resolve(process.cwd(), configPath)

  try {
    const mod = await import(abs)
    return mod.default ?? mod
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`Failed to load config from '${abs}': ${msg}`)
    process.exit(1)
  }
}

/**
 * Parse CLI arguments.
 */
const parseArgs = (argv: string[]) => {
  const args = argv.slice(2)
  const command = args[0] as Command | undefined
  let configPath = './storium.config.ts'

  const configIdx = args.indexOf('--config')
  if (configIdx !== -1 && args[configIdx + 1]) {
    configPath = args[configIdx + 1]
  }

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

  const config = await loadConfig(configPath)

  switch (command) {
    case 'generate': {
      const result = await generate(config)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
      break
    }

    case 'migrate': {
      const result = await migrate(config)
      console.log(result.message)
      process.exit(result.success ? 0 : 1)
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
      // Seeds need a live DB connection
      const db = connect(config)
      try {
        const result = await runSeeds(config, db.drizzle)
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
