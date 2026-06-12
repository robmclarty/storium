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
  `pr5-typed-mixins` (item #2) and `pr6-hidden-projection` (item #3, this branch).
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
| 3 | Hidden-column projection (4c) | plan PR 2 §4c | P1 (high value / high complexity) | ✅ done (`pr6-hidden-projection`) |
| 4 | Optional `logger` in `StoriumConfig` | plan PR 4 / report | P2 | ⬜ deferred |
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

**Status:** ✅ done on branch `pr6-hidden-projection` (impl commit `2192d9f`).
Not yet merged into `main` (waiting on item #1's first green CI run, like the
other unpushed work).

**What shipped:** the one genuine type lie is fixed — public store methods now
`Omit` `hidden: true` columns from their returned rows.
- New `HiddenKeys<TConfig>` (in `types.ts`) extracts the `hidden: true` column
  literals from a **`const`-captured** config; `PublicRow<TTable, THidden> =
  Omit<InferSelectModel<TTable>, THidden>` is used by `DefaultCRUD` /
  `SoftDeleteCRUD` for every row-returning method. `THidden` defaults to `never`
  (Omit no-op), so non-hidden stores are unchanged.
- Threaded `THidden` through `Store`, `StoreDefinition` (+ a runtime
  `hiddenColumns` carrier field) and `InferStore`, so the `register()` and
  `db.defineStore()` paths agree.

**How the known tensions resolved:**
- *Literal capture:* a `const TConfig` type param on `defineStore` /
  `db.defineStore` captures `hidden: true` **and** preserves the existing
  column-key typo check (the excess-property check still fires — verified).
  Required relaxing `conflictTarget` to `readonly string[]` (the one small
  breaking change).
- *`includeHidden` collision:* smaller than feared — `includeHidden` lives only
  on `PrepOptions` (the `ctx` surface), not the public `QueryOptions`. So the
  `Omit` applies cleanly to public methods, and **ctx CRUD is intentionally left
  at the full row** (no conditional-return overloads needed).
- *Inputs:* not omitted — `hidden` implies writable, so `create`/`update` still
  accept hidden columns; only outputs strip them.

**Risk check (passed):** error messages stay readable —
`Property 'password' does not exist on type 'Omit<{ … }, "password">'`.

**Verification:** `npm test` green (340 unit tests — added QA-10407..QA-10411 in
`typed-store.test.ts`); `npm run typecheck:examples` clean (the pg/sqlite/mysql
examples hide `password_hash` and only read it via the ctx/`includeHidden`
path). `docs/type-safety.md` updated (new §5; the deferred note removed).

**Known limitation (documented):** only `columns.<col>.hidden: true` is
captured — a column hidden via table-level access overrides is still stripped at
runtime but not reflected in the type.

---

## 4. Optional `logger` in `StoriumConfig` (plan PR 4 / report Part 2) — **P2**

**Status:** ⏸️ deferred in PR 4 (low priority).

**Why:** library code logs directly to the console; no way to silence or
redirect. PR 3's 5c already removed the two worst `console.warn`-and-continue
paths (now fatal throws), so this is now cosmetic.

**Remaining `console.*` sites (verified):**
- `src/connect.ts:319` — `console.warn`
- `src/migrate/seed.ts:227` — `console.warn` ("Skipping … not a valid seed module")
- `src/migrate/seed.ts:234` / `:237` — `console.log` (seed progress)
- `src/migrate/seed.ts:240` — `console.error` (seed failure)
- (`src/errors.ts:20` is only a docstring example — not a real call.)

**Approach:** add `logger?: Logger` to `StoriumConfig`, default to `console`,
thread through `connect()` → `StoriumInstance` → `migrate/*`, replace the calls
above.

**Acceptance:** `logger` is configurable and defaults to console; no direct
`console.*` left in non-test `src/` (except the docstring); a test asserts a
custom logger receives the messages.

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
2. **Typed mixin results (#2)** — done on `pr5-typed-mixins` (unmerged).
3. ~~**Hidden-column projection (#3)**~~ — ✅ done (`pr6-hidden-projection`); the
   real correctness win, landed while pre-1.0 breaking changes are still free.
4. Then the P2/P3 polish (#4–#7) as appetite allows.
