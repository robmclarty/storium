# Contributing to Storium

Thanks for hacking on Storium. This guide covers the local development setup,
the test suite, and a couple of environment gotchas.

## Prerequisites

- **Node.js >= 22.13** — what pnpm 11 needs to run (the CI matrix runs 22.x and
  24.x; the published package still declares `node >= 20`)
- **pnpm** — the exact version is pinned in `package.json` (`packageManager`);
  run `corepack enable` once and every `pnpm` call uses it
- **Docker** — only needed to run the integration suite (testcontainers spins up
  real PostgreSQL and MySQL containers)

## Setup

```bash
corepack enable   # once per machine
pnpm install
pnpm run build
```

`pnpm install` also wires up the examples: every `examples/*` directory is a
pnpm workspace package that depends on `storium` via `workspace:*`, a symlink
to this repo that resolves the library from `dist/`. Build first, then
`pnpm start` inside any example.

## Common tasks

| Command | What it does |
|---|---|
| `pnpm check` | The full gate — every check, in [checkride](https://www.npmjs.com/package/checkride)'s waves |
| `pnpm check --only <slot>` | Run one check (e.g. `types`, `lint`, `test`, `docs`) |
| `pnpm check --bail` | Stop at the first failing check |
| `pnpm check:all` | The full gate plus opt-in checks, including `integration` (needs Docker) |
| `pnpm check:fix` | Apply every fixer (oxlint `--fix`, fallow fix, markdownlint `--fix`) |
| `pnpm doctor` | Verify the environment and each check's status (read-only) |
| `pnpm test` | Run the unit suite once (`vitest run`) |
| `pnpm test:watch` | Run the unit suite in watch mode |
| `pnpm run test:integration` | Run the Docker-backed integration suite directly |
| `pnpm run build` | Bundle ESM + CJS + types with tsup |

### The check gate

`pnpm check` is the single definition of "done": exit 0 means the work is
complete, any other exit code means it is not. When a check fails, read
`.check/summary.json` to see which one, then `.check/<slot>.json` (or
`.check/<slot>.stdout.txt` / `.stderr.txt`) for the details, and fix the root
cause. `checkride.config.json` is the list of checks and how each one is wired.
The `.check/` report is gitignored.

## Testing

### Unit tests

```bash
pnpm test              # vitest run — the unit suite once
pnpm check --only test # the same suite, through the gate (with coverage)
```

Unit tests live in `src/**/__tests__/**/*.test.ts` and run against the in-memory
SQLite dialect, so they need no external services.

### Integration tests

```bash
pnpm check --only integration   # through the gate (opt-in check)
pnpm run test:integration       # or the script directly
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

```text
Error: The module '.../better_sqlite3.node' was compiled against a different
Node.js version using NODE_MODULE_VERSION 127. This version of Node.js requires
NODE_MODULE_VERSION 137. Please try re-compiling or re-installing the module.
```

This is purely an environment mismatch, not a code problem. Rebuild the addon
against your current Node.js:

```bash
pnpm rebuild better-sqlite3
```

Then re-run `pnpm test`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

- **check** — matrix on Node 22.x / 24.x: `checkride --strict` (the full gate —
  types, lint, struct, links, deps, dead, dupes, health, docs, spell, build,
  examples typecheck, publint, attw, pack, smoke, unit tests)
- **integration** — Docker-backed `checkride --strict --only integration`

A failing run uploads the `.check/` report as an artifact and prints the failing
slots' output inline.

## Release ritual

Releases are tagged `vX.Y.Z`; the root `package.json` version is the source of
truth. With Claude Code, `/version <major|minor|patch>` performs steps 1–4 and
pushes the tag; pushing `main` itself stays yours.

1. Start from a clean tree on `main`, up to date with `origin/main`, with
   `pnpm check` green.
2. Bump the version with `pnpm version <type> --no-git-tag-version` — it rewrites
   `package.json` (semver — pre-1.0, breaking changes take a minor bump).
3. Turn the `## Unreleased` section of `CHANGELOG.md` into `## X.Y.Z` (or add
   one), summarizing every commit since the last `vX.Y.Z` commit.
4. Commit as `vX.Y.Z`, tag (annotated) `vX.Y.Z`, push the commit and the tag.
5. The tag push triggers two independent workflows, kept separate so the npm
   credential surface and the release-authoring surface never share a job:
   - [.github/workflows/publish.yaml](./.github/workflows/publish.yaml):
     `checkride --strict` + `checkride --strict --only integration`, then
     `pnpm publish --provenance` —
     every published tarball is provenance-attested to its commit. Auth is npm
     **Trusted Publishing** (OIDC): no token exists anywhere, so there is
     nothing to leak, rotate, or bypass 2FA with. The job runs in the
     `npm-publish` GitHub Environment and **pauses for a required-reviewer
     approval** — the CI equivalent of the old local MFA prompt. Approve it
     from the run page (or the repo's Environments tab) to release.
   - [.github/workflows/release.yaml](./.github/workflows/release.yaml):
     creates the GitHub Release for the tag, with notes pulled from the
     matching `CHANGELOG.md` section.

   One-time setup, both required for the first run: **npmjs.com** — package
   settings → Trusted Publisher → GitHub Actions, repository
   `robmclarty/storium`, workflow filename `publish.yaml`, environment
   `npm-publish`; **GitHub** — repo Settings → Environments → `npm-publish`
   with a required reviewer (yourself).
6. Approve the paused `publish` run, then smoke-test the published package
   (`npm view storium@latest version`).
