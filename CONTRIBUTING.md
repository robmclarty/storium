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
- **unit** — matrix on Node 20.x / 22.x / 24.x: `npm run build` + unit tests
- **integration** — Docker-backed `vitest.integration.config.ts`

## Release ritual

Releases are tagged `vX.Y.Z`; the root `package.json` version is the source of
truth. With Claude Code, `/version <major|minor|patch>` performs steps 1–4 and
pushes the tag; pushing `main` itself stays yours.

1. Start from a clean tree on `main`, up to date with `origin/main`, with
   `npm test` green.
2. Bump the version with `npm version <type> --no-git-tag-version` — it rewrites
   `package.json` and both top-level `version` fields in `package-lock.json`
   (semver — pre-1.0, breaking changes take a minor bump).
3. Turn the `## Unreleased` section of `CHANGELOG.md` into `## X.Y.Z` (or add
   one), summarizing every commit since the last `vX.Y.Z` commit.
4. Commit as `vX.Y.Z`, tag (annotated) `vX.Y.Z`, push the commit and the tag.
5. The tag push triggers two independent workflows, kept separate so the npm
   credential surface and the release-authoring surface never share a job:
   - [.github/workflows/publish.yaml](./.github/workflows/publish.yaml):
     `npm test` + `npm run test:integration`, then `npm publish --provenance` —
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
