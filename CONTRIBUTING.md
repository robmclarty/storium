# Contributing to Storium

Thanks for hacking on Storium. This guide covers the local development setup,
the test suite, and a couple of environment gotchas.

## Prerequisites

- **Node.js >= 20** (the CI matrix runs 20.x and 22.x)
- **npm** — the project uses npm, not pnpm or yarn
- **Docker** — only needed to run the integration suite (testcontainers spins up
  real PostgreSQL and MySQL containers)

## Setup

```bash
npm ci
npm run build
```

## Common tasks

| Command | What it does |
|---|---|
| `npm run build` | Bundle ESM + CJS + types with tsup |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.check.json` (includes test files) |
| `npm run typecheck:examples` | Typecheck every example in `examples/*` |
| `npm run lint` | oxlint + fallow + dependency-cruiser + ast-grep + knip |
| `npm run test:run` | Run the unit suite once (vitest) |
| `npm run test:unit` | Run the unit suite in watch mode |
| `npm run test:integration` | Run the Docker-backed integration suite |
| `npm test` | typecheck + lint + build + unit (the full gate) |

## Testing

### Unit tests

```bash
npm run test:run
```

Unit tests live in `src/**/__tests__/**/*.test.ts` and run against the in-memory
SQLite dialect, so they need no external services.

### Integration tests

```bash
npm run test:integration
```

These use [testcontainers](https://testcontainers.com/) to start real PostgreSQL
and MySQL databases, so Docker must be running. The default dialect set is
`memory,postgresql,mysql`; narrow it with the `TEST_DIALECTS` env var:

```bash
TEST_DIALECTS=memory vitest run --config vitest.integration.config.ts
```

## Gotcha: `better-sqlite3` and `NODE_MODULE_VERSION`

`better-sqlite3` is a native addon compiled against the ABI of a specific Node.js
version. If you switch Node versions (e.g. via `nvm`) after installing
dependencies, the unit suite will fail at import time with an error like:

```
Error: The module '.../better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 137. Please try re-compiling or re-installing the module.
```

This is purely an environment mismatch, not a code problem. Rebuild the addon
against your current Node.js:

```bash
npm rebuild better-sqlite3
```

Then re-run `npm run test:run`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **lint** — `npm run lint`
- **typecheck** — `tsc -p tsconfig.check.json --noEmit` + `typecheck:examples`
- **unit** — matrix on Node 20.x / 22.x: `npm run build` + unit tests
- **integration** — Docker-backed `vitest.integration.config.ts`

Publishing to npm is still manual (`npm run release`); revisit automating it at
1.0.
