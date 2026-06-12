# Storium — Remaining Work Tracker

**Last updated:** 2026-06-11
**Tracks:** work left after the 4-PR production-readiness effort
(`production-readiness-plan.md` / `production-readiness-report.md`).

This is a living doc. Update the **Status** column and the per-item **Status**
line as work lands. Keep the "Current state" snapshot at the top accurate — it's
the first thing to read before picking up an item.

---

## Current state (snapshot)

- **Version:** `0.15.2` (`main` @ `683cabe`, pushed to `origin/main`).
- **Branch state:** all 4 production-readiness PRs are merged into `main`:
  - PR 1 (type pass-through) — `f52f7ab` merge
  - PR 2 (design generics) — `a49d538` merge
  - PR 3 (CI + runtime hardening) — `a42de35` merge
  - PR 4 (sweeps) — `41165c2` merge
- **Pushed + CI green:** `main` is up to date with `origin/main`. CI has run
  green on a real runner — first on the `v0.15.2` push (run `27393242387`,
  all 5 jobs ✓ incl. Integration/Docker), then again on the Node 24 bump
  (GitHub PR #1, run `27396255745`, all 6 jobs ✓).
- **CI now runs on Node 24:** `actions/checkout` / `actions/setup-node` bumped
  to `@v5` (Node 24 runtime), pinned job runtimes moved 20.x → 24.x, and the
  unit matrix covers `[20.x, 22.x, 24.x]`. The Node 20 action-deprecation
  warning is resolved.
- **All functional items done:** items #2–#5 are merged and CI-verified — #5's
  PG/MySQL isolation path is now confirmed by the green Integration/Docker job
  (it could not be run locally; Docker was unavailable).
- **Local gate is green:** `npm test` exits 0 (`exactOptionalPropertyTypes` on)
  and `npm run typecheck:examples` is clean.
- **Merged feature branches deleted** (item #7): `pr1-restore-type-passthrough`
  through `pr8-tx-isolation` removed locally. `fable-upgrades` (merged, but
  outside this effort) intentionally kept.

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
| 1 | Push + first green CI run | PR 3 follow-through | **P0 — immediate** | ✅ done (pushed; CI green, runs `27393242387` + `27396255745`) |
| 2 | Typed mixin results (4d) | plan PR 2 §4d | P1 | ✅ done (`pr5-typed-mixins`, merged) |
| 3 | Hidden-column projection (4c) | plan PR 2 §4c | P1 (high value / high complexity) | ✅ done (`pr6-hidden-projection`, merged) |
| 4 | Optional `logger` in `StoriumConfig` | plan PR 4 / report | P2 | ✅ done (`pr7-logger`, merged) |
| 5 | Configurable transaction isolation levels | report Part 2 (med/low) | P3 | ✅ done (`pr8-tx-isolation`, merged); PG/MySQL CI-verified |
| 6 | Release workflow (tag-triggered publish) | plan PR 3 §5a | P3 (revisit at 1.0) | ⏸️ deferred |
| 7 | Delete merged local branches | housekeeping | P3 | ✅ done (`pr1`–`pr8` deleted; `fable-upgrades` kept) |

Legend: ⬜ not started · 🟡 doing · ✅ done · ⏸️ deferred

---

## 1. Push + first green CI run — **P0**

**Status:** ✅ done. `main` is pushed to `origin/main` (@ `683cabe`). CI has run
green on a real runner twice:
- **`v0.15.2` push** — run `27393242387`, all 5 jobs ✓ (Lint, Typecheck,
  Unit 20.x/22.x, Integration/Docker). The Node 20 action-deprecation warning
  surfaced here.
- **Node 24 bump (PR #1)** — run `27396255745`, all 6 jobs ✓ (adds Unit 24.x),
  deprecation warning resolved.

The integration job started real Postgres + MySQL via testcontainers and passed
— this is what validated item #5's PG/MySQL isolation path. No runner-only
fallout. The "CI has never run" caveat is removed.

**Why (historical):** PR 3's entire value was unrealized until CI ran on a real
runner. Nothing had been validated on GitHub — only locally.

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

**Status:** ✅ done — merged into `main` (`Merge PR 5`, impl commit `4f33263`).
Pending only the first green CI run (item #1), like the rest of the unpushed work.

**What shipped:** `belongsTo` / `hasMany` / `hasOne` / `withMembers` now return a
typed join row instead of `(id) => Promise<any>`.
- New `src/mixins/relation-types.ts` — `RowOf` / `SelectedRow` / `PrefixedRow`.
  `RowOf<T> = T extends Table ? InferSelectModel<T> : Record<string, unknown>`,
  so the mixins stay **unconstrained** (no `extends Table`): the existing
  `as unknown as TableDef` call sites in the runtime tests keep compiling, while
  real `defineStore(...).table` args get precise rows.
- `select` is captured as a `const` tuple, narrowing the result to the chosen
  columns; omitting it yields the full related row.
- `belongsTo` prefixes related columns by alias (`${alias}_${col}`) and
  intersects an open index signature for the parent's inlined columns (the
  parent table type isn't visible to the mixin — `ctx` stays `any` internally,
  as intended).
- `withMembers`' `addMember` / `getMembers` return the join row; the rest keep
  their scalar/void result.

**Verification:** `npm test` green (now 339 unit tests — added QA-10403..QA-10406
in `src/mixins/__tests__/typed-mixins.test.ts`); `npm run typecheck:examples`
clean (`examples/relations/` still typechecks). `docs/type-safety.md` updated
(new §5; the deferred note removed).

---

## 3. Hidden-column projection (plan PR 2 §4c) — **P1**

**Status:** ✅ done — merged into `main` (`Merge PR 6`, impl commit `2192d9f`).
Pending only the first green CI run (item #1).

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

**Status:** ✅ done — merged into `main` (`Merge PR 7`, impl commit `bfe9fd8`).
Pending only the first green CI run (item #1).

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

**Status:** ✅ done — merged into `main` (`Merge PR 8`, impl commit `871129a`).
**PG/MySQL behavior is now CI-verified:** the Integration (Docker) job ran the
isolation suite against real Postgres + MySQL on a runner and passed (CI runs
`27393242387` / `27396255745`). The earlier "pending CI" caveat (Docker
unavailable locally) is resolved.

**What shipped:** `db.transaction(fn, { isolationLevel })` plumbs the level to
Drizzle's per-transaction config on PostgreSQL/MySQL.
- New `IsolationLevel` (`'read uncommitted' | 'read committed' | 'repeatable
  read' | 'serializable'`) and `TransactionOptions` types on the public API.
- `createWithTransaction` passes `{ isolationLevel }` to `db.transaction()` only
  when requested; the default path is untouched.
- **SQLite/`memory`:** the option is a **no-op** (not an error) — better-sqlite3
  runs a single serialized connection, so it's inherently serializable. Chose
  no-op over erroring so the same code stays portable across dialects.

**Verification:**
- ✅ Locally verified: `npm test` (QA-10415 — memory accepts `isolationLevel`
  and still commits); memory integration path (QA-10416, 6/6 via
  `TEST_DIALECTS=memory`); typecheck + build + `typecheck:examples` clean.
- ✅ **CI-verified:** the PG/MySQL isolation plumbing ran through the integration
  suite (QA-10416 across dialects) on a real runner — the Integration (Docker)
  job started Postgres + MySQL via testcontainers and passed (CI runs
  `27393242387` / `27396255745`). The code is a thin pass-through to Drizzle's
  documented `transaction(fn, { isolationLevel })` API
  (`PgTransactionConfig` / `MySqlTransactionConfig`).

**Docs:** AGENTS.md "Transactions (dialect differences)" and
`docs/api-reference.md` updated.

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

**Status:** ✅ done. All eight merged PR branches were deleted locally:

```
git branch -d pr1-restore-type-passthrough pr2-design-generics \
              pr3-ci-hardening pr4-sweeps pr5-typed-mixins \
              pr6-hidden-projection pr7-logger pr8-tx-isolation
```

`fable-upgrades` is also merged into `main` but was **intentionally kept** —
it's outside this production-readiness effort. Delete it separately if it's
no longer needed.

---

## Recommended order

1. ~~**Push and get CI green (#1)**~~ — ✅ done (pushed; CI green on Node 24).
2. ~~**Typed mixin results (#2)**~~ — ✅ done (`pr5-typed-mixins`, merged).
3. ~~**Hidden-column projection (#3)**~~ — ✅ done (`pr6-hidden-projection`, merged).
4. ~~**P2/P3 polish (#4, #5, #7)**~~ — ✅ done (logger, tx isolation, branch cleanup).

**Only remaining item:** #6 (release workflow) — intentionally deferred to 1.0.
