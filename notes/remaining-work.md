# Storium — Remaining Work Tracker

**Last updated:** 2026-06-11
**Tracks:** work left after the 4-PR production-readiness effort
(`production-readiness-plan.md` / `production-readiness-report.md`).

This is a living doc. Update the **Status** column and the per-item **Status**
line as work lands. Keep the "Current state" snapshot at the top accurate — it's
the first thing to read before picking up an item.

---

## Current state (snapshot)

- **Version:** `0.15.1` (bumped post-merge; `main` @ `0ad9843`).
- **Branch state:** all 4 production-readiness PRs are merged into `main`:
  - PR 1 (type pass-through) — `f52f7ab` merge
  - PR 2 (design generics) — `a49d538` merge
  - PR 3 (CI + runtime hardening) — `a42de35` merge
  - PR 4 (sweeps) — `41165c2` merge
- **Not pushed:** `main` is ~15 commits ahead of `origin/main`. **CI has never
  run** — `.github/workflows/ci.yml` only executes once pushed to GitHub.
- **Open branches (off `main`, done but unmerged, waiting on the first green CI):**
  `pr5-typed-mixins` (item #2), `pr6-hidden-projection` (item #3), and
  `pr7-logger` (item #4, this branch). Each flips only its own tracker row.
- **Local gate is green:** `npm test` exits 0 (335 unit tests,
  `exactOptionalPropertyTypes` on) and `npm run typecheck:examples` is clean.
- **Merged local branches** `pr3-ci-hardening` / `pr4-sweeps` still exist — safe
  to delete.

### What's already done (so we don't re-open it)
- `.queries()` signature preservation, table→dialect ctx inference, soft-delete
  method typing, typed `StoreConfig` column keys (PR 1 + PR 2).
- GitHub Actions CI (lint / typecheck+examples / unit Node 20.x+22.x / Docker
  integration), `CONTRIBUTING.md` with the `better-sqlite3` rebuild note,
  fatal migrate import errors (PR 3).
- `"sideEffects": false`, `exactOptionalPropertyTypes: true`, AGENTS.md
  structure rewrite, `docs/type-safety.md` rewrite, MySQL race caveat in
  `docs/api-reference.md` (PR 4).

---

## Status at a glance

| # | Item | Source | Priority | Status |
|---|---|---|---|---|
| 1 | Push + first green CI run | PR 3 follow-through | **P0 — immediate** | ⬜ not started |
| 2 | Typed mixin results (4d) | plan PR 2 §4d | P1 | ⬜ not started |
| 3 | Hidden-column projection (4c) | plan PR 2 §4c | P1 (high value / high complexity) | ⬜ not started |
| 4 | Optional `logger` in `StoriumConfig` | plan PR 4 / report | P2 | ✅ done (`pr7-logger`) |
| 5 | Configurable transaction isolation levels | report Part 2 (med/low) | P3 | ⬜ not started |
| 6 | Release workflow (tag-triggered publish) | plan PR 3 §5a | P3 (revisit at 1.0) | ⬜ deferred |
| 7 | Delete merged local branches | housekeeping | P3 | ⬜ not started |

Legend: ⬜ not started · 🟡 doing · ✅ done · ⏸️ deferred

---

## 1. Push + first green CI run — **P0**

**Status:** ⬜ not started.

**Why:** PR 3's entire value is unrealized until CI runs on a real runner.
Nothing here has been validated on GitHub — only locally.

**What to watch on the first run (CI-only risk surface):**
- **typecheck job** — the `npm ci → tsc → build → per-example npm install →
  typecheck:examples` sequence. Example `storium` resolution depends on the
  `file:../..` symlink + a built `dist`; `drizzle-orm`/`zod` resolve by
  parent-dir traversal to the **root** `node_modules`. This worked locally but
  has never run from a clean checkout.
- **unit matrix** — fresh `better-sqlite3` native compile on Node **20.x and
  22.x** (the local env is Node 24).
- **integration job** — testcontainers starting real Postgres + MySQL via the
  runner's Docker daemon (`npm run test:integration`,
  `TEST_DIALECTS=memory,postgresql,mysql`). Slowest, most likely to surface
  runner-specific issues (Ryuk, image pulls, timeouts).

**Acceptance:** push `main` (or open a PR), all four CI jobs green. Fix any
runner-only fallout. Then the tracker's "CI has never run" caveat can be removed.

---

## 2. Typed mixin results (plan PR 2 §4d) — **P1**

**Status:** ⬜ not started. *Recommended first substantive item — self-contained,
doesn't build on anything else.*

**Why:** `belongsTo` / `hasMany` / `hasOne` / `withMembers` type their method
*names* via template literals but return `(id) => Promise<any>`. The join row
shape is recoverable from the related table type + alias literal.

**Where:** `src/mixins/belongsTo.ts:49` and `:101` (the `Promise<any>` in the
`findWith${Capitalize<A>}` mapped type); same pattern in `hasMany.ts`,
`hasOne.ts`, `withMembers.ts`.

**Approach (from the plan):** with the related table's type + alias available,
type the result as a mapped type that prefixes the related columns by alias —
roughly `InferRow<TTable> & { [K in keyof RelatedCols as `${A}_${K}`]: ... }`.
Pre-1.0, breaking changes are free.

**Acceptance:** mixin methods return a typed join row (not `Promise<any>`);
`expectTypeOf` coverage added to `typed-store.test.ts` (or a mixin-specific type
test); examples in `examples/relations/` still typecheck; update the "typed
mixin results remain deferred" note in `docs/type-safety.md`.

**Risk:** adds a generics surface to the mixins; keep `ctx: any` internally
(circular-import avoidance between `types.ts` and the mixin modules is
intentional — see `docs/type-safety.md`).

---

## 3. Hidden-column projection (plan PR 2 §4c) — **P1**

**Status:** ⬜ not started. *Highest-value correctness item, but the hardest.*

**Why:** this is the one genuine **type lie** left: `hidden: true` strips a
column from SELECT results at runtime, but the public row type still includes it
(e.g. `findOne()` types a `password` field the runtime removes). Everything else
remaining is looseness, not incorrectness.

**Approach (from the plan):** capture per-column `hidden: true` as *literal*
types from config, then `Omit` those keys from public row types. Apply the
`Omit` to **public store methods only**.

**Known tensions (why it was deferred):**
- Requires literal `TConfig` capture — the overload approach in PR 2
  deliberately avoided this to dodge boolean-literal widening and
  `conflictTarget: string[]` ↔ `readonly` friction. Re-introducing literal
  capture (or `const` type params) brings those back.
- Collides with the `includeHidden` escape hatch, which returns the **full**
  row — the `Omit` must not apply on that path.
- The plan itself hedges: "pre-1.0 simplicity has value too."

**Acceptance:** public methods omit `hidden` columns from their row types;
`includeHidden: true` still yields the full row; `@ts-expect-error` test proving
a hidden field is absent from the default projection; remove the "hidden-column
projection remains deferred" note from `docs/type-safety.md`.

**Risk:** type complexity + error-message readability (plan risk #3: readable
errors > maximal inference). If it makes errors unreadable, stop and reconsider.

---

## 4. Optional `logger` in `StoriumConfig` (plan PR 4 / report Part 2) — **P2**

**Status:** ✅ done on branch `pr7-logger` (impl commit `bfe9fd8`). Not yet
merged into `main` (waiting on item #1's first green CI run).

**What shipped:** an optional `logger` sink (defaults to `console`) routes
storium's own diagnostics.
- New `Logger` type (`{ log, warn, error }`) on the public API — `console`
  satisfies it. `StoriumConfig.logger?` and `FromDrizzleOptions.logger?`,
  resolved to `console` and exposed as `db.logger` (`StoriumInstance.logger`).
- Threaded through `buildInstance`: the `defineStore` re-config warning
  (`connect.ts`) now uses the instance logger.
- `seed()` resolves `config.logger ?? db.logger ?? console` and routes its
  progress / skip / error lines through it.

**Verification:** `npm test` green (338 unit tests — QA-10412/10414 in
`connect.test.ts`, QA-10413 in `seed.test.ts` assert a custom logger receives
the messages); `npm run typecheck:examples` clean. The only `console.*` left in
non-test `src/` is the `errors.ts:20` docstring example. AGENTS.md's
`StoriumConfig` example documents `logger`.

---

## 5. Configurable transaction isolation levels (report Part 2) — **P3**

**Status:** ⬜ not started. Never scoped into a PR.

**Why:** the report flags that transaction isolation levels aren't configurable.
Drizzle supports per-transaction isolation config on Postgres/MySQL.

**Where:** the `transaction()` wrapper (`src/connect.ts`) and SQLite's manual
`BEGIN/COMMIT/ROLLBACK` path. SQLite has no isolation-level knob, so this is a
Postgres/MySQL-only option that must no-op (or error clearly) on SQLite/memory.

**Acceptance:** `db.transaction(fn, { isolationLevel })` (or similar) plumbs the
level to Drizzle on PG/MySQL; documented dialect differences; integration test
on at least Postgres.

---

## 6. Release workflow automation (plan PR 3 §5a) — **P3, revisit at 1.0**

**Status:** ⏸️ deferred. Manual `npm run release` is acceptable pre-1.0 (plan
explicitly permits this).

**Why/Approach:** a tag-triggered GitHub Actions job that builds and
`npm publish`es on version tags, replacing the manual flow. Gate on the CI jobs
passing first.

**Acceptance:** pushing a `v*` tag publishes to npm with provenance; manual
`release` script retired or kept as a fallback.

---

## 7. Housekeeping — delete merged local branches — **P3**

**Status:** ⬜ not started.

`pr3-ci-hardening` and `pr4-sweeps` are merged into `main` and can be deleted
(`git branch -d pr3-ci-hardening pr4-sweeps`). Do this after the push (item 1),
in case anything needs re-pushing from the original branch.

---

## Recommended order

1. **Push and get CI green (#1)** — establishes a real signal before any new work.
2. **Typed mixin results (#2)** — self-contained; a clean standalone PR.
3. **Hidden-column projection (#3)** — the real correctness win; tackle while
   pre-1.0 breaking changes are still free, but timebox the generics complexity.
4. Then the P2/P3 polish (#4–#7) as appetite allows.
