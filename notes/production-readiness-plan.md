# Storium Production-Readiness Implementation Plan

**Date:** 2026-06-11
**Source:** `production-readiness-report.md` (same folder)
**Sequencing:** 4 PRs. PR 1 is mechanical and restores type flow end to end; PR 2 is
the design-level generics pass; PR 3 is CI/infrastructure; PR 4 is small sweeps.

---

## PR 1 — Restore type pass-through (Phases 1–3) — ✅ DONE

**Status:** Implemented and green. Commit `c232cd8` on branch
`pr1-restore-type-passthrough`. `npm test` passes end-to-end (typecheck + lint +
build + 328 unit tests across 27 files, exit 0). Examples typecheck clean.
**Next up: PR 2** (start it branched off `pr1-restore-type-passthrough` — it
builds on these types).

**Refinement vs. the written plan (Phase 3b):** `ctx.table` was planned as
`TTable & { storium: StoriumMeta }`. That broke the documented standalone
query-file pattern (`examples/*/entities/*/user.queries.ts` uses bare `Ctx`, so
`TTable = Table`, and accesses `ctx.table.email` as a property — which relied on
`TableDef`'s index signature). Final form follows this codebase's existing
fallback idiom (`InferRow`, `DrizzleDatabase`): precise when the table is bound,
loose `TableDef` when it's the base `Table`:
`table: Table extends TTable ? TableDef : TTable & { storium: StoriumMeta }`.

**Env note:** the 72 failing unit tests from the survey were purely the
better-sqlite3 `NODE_MODULE_VERSION` mismatch — `npm rebuild better-sqlite3`
fixed it; all 328 now pass. (Documenting this in CONTRIBUTING is still a PR 3 item.)

Verification tests live in `src/store/__tests__/typed-store.test.ts` and are
enforced by `npm run typecheck` (tsconfig.check.json includes test files).
Confirmed non-vacuous via a negative-control check.

---

### Original plan (for reference)

### Phase 1: Fix `.queries()` signature erasure

The core change: infer the whole query-function record (`TFns`) instead of just key
names (`TKeys`), so each query's parameter list and return type survive into
`TQueries` and out the other side of `Store`'s mapped type.

**1a. `src/store/define.ts:68-70`** — `StoreDefinition.queries`:

```ts
queries: <TFns extends Record<string, (ctx: RepositoryContext<InferTableDialect<TTable>, TTable>) => (...args: any[]) => any>>(
  fns: TFns
) => StoreDefinition<TTable, TQueries & TFns>
```

(`InferTableDialect` comes from Phase 2; use `Dialect` until that lands.)

**1b. `src/types.ts:566-573`** — `StoriumInstance.defineStore` return type:

```ts
defineStore: <TTable extends Table>(
  drizzleTable: TTable,
  config?: StoreConfig
) => Store<TTable> & {
  queries: <TFns extends Record<string, (ctx: RepositoryContext<D, TTable>) => (...args: any[]) => any>>(
    queryFns: TFns
  ) => Store<TTable, TFns>
}
```

**1c. `src/connect.ts:330-331`** — update `instanceDefineStore`'s runtime `.queries`
generic to match (it's behind an `as unknown as` cast, but keep it consistent).

**Verify:** ctx is still contextually typed inside `(ctx) => ...` when the user
writes no annotation (contextual typing flows from the generic constraint). Lock
with type tests (see Verification below).

### Phase 2: Bind table + dialect into multi-file ctx

**2a. `src/types.ts`** — add a table-type→dialect conditional (type-only imports of
`PgTable` / `MySqlTable` / `SQLiteTable` already have precedent in this file):

```ts
export type InferTableDialect<TTable> =
  TTable extends PgTable ? 'postgresql'
  : TTable extends MySqlTable ? 'mysql'
  : TTable extends SQLiteTable ? 'sqlite' | 'memory'
  : Dialect
```

Note: `DrizzleDatabase<'sqlite' | 'memory'>` distributes correctly to
`BaseSQLiteDatabase` — confirmed by reading the existing conditional at
`src/types.ts:30-38`.

**2b.** Use it in `StoreDefinition.queries` (1a above) so the multi-file pattern
gets a concrete `ctx.drizzle` and typed CRUD without knowing the instance.

**Design note:** a `pgTable` used against a `memory` connection will get pg-typed
ctx at compile time. Type-level only, no runtime impact, but document it in
`docs/type-safety.md`. (Tests/examples that mix table flavors with the memory
dialect may surface this.)

### Phase 3: Tighten supporting types

**3a. `src/types.ts:321`** — make `PrepOptions` generic:

```ts
export type PrepOptions<TTable = any> = QueryOptions<TTable> & { ... }
```

Then in `RepositoryContext` (`src/types.ts:346-369`): use
`DefaultCRUD<TTable, PrepOptions<TTable>>` and
`prep: (input, opts?: PrepOptions<TTable>)`. All bare `PrepOptions` uses in
`src/store/repository.ts` keep compiling via the default. `PaginateOptions`
(`src/types.ts:468`) keeps the default too.

**3b. `src/types.ts:358`** — `ctx.table: TTable & { storium: StoriumMeta }`
(replacing `TableDef`). Keep `TableDef` for internal/runtime use. Consequence:
dynamic string indexing on `ctx.table` inside custom queries now needs a cast —
intended. Mixins use `ctx: any` and are unaffected.

**3c. `src/types.ts:217-234`** — parameterize the schema set:

```ts
export type SchemaSet<TTable extends Table = Table> = {
  selectSchema: RuntimeSchema<InferRow<TTable>>
  createSchema: RuntimeSchema<InferInput<TTable>>
  updateSchema: RuntimeSchema<Partial<InferInput<TTable>>>
  fullSchema: RuntimeSchema<InferRow<TTable>>
}
```

Thread `SchemaSet<TTable>` into `Store.schemas` and `RepositoryContext.schemas`.
Keep `StoriumMeta` non-generic (default `SchemaSet`) to avoid cascading generics
through `attachStoriumMeta`; cast at the repository boundary. Accept that Zod
transforms make these approximate — still vastly better than `any`.

**3d. `src/types.ts:587`** — fix `Promisable<T> = T | Promise<T>` (currently
`Promise<any>`). It's exported but unused internally; fixing is safer than
deleting if any consumer-facing docs mention it.

**3e. (optional, same pass)** — type the instance transaction callback:
`transaction: <T>(fn: (tx: DrizzleDatabase<D>) => Promise<T>) => Promise<T>`.
Drizzle transaction classes extend the corresponding database base classes, so
this is sound for query building. Leave `QueryOptions.tx?: any` as accepted
looseness (typing it requires threading `D` through `QueryOptions`; not worth
the cascade).

### Verification for PR 1

- Convert the probe from the report into permanent type tests in
  `src/store/__tests__/typed-store.test.ts` using `expectTypeOf`:
  - ctx CRUD row types in **both** paths (multi-file + simple)
  - `ctx.drizzle` resolves to the concrete Drizzle class in both paths
  - custom query signatures preserved through `register()` and
    `db.defineStore().queries()` (parameters AND return type)
  - `where` callback receives the typed table inside ctx CRUD opts
  - `schemas.createSchema.validate()` returns the insert model type
  - `Promisable<T>` round-trips `T`
- `npx tsc -p tsconfig.check.json --noEmit`
- `npm run typecheck:examples` (catches regressions against real usage patterns)
- Full unit suite (after better-sqlite3 rebuild — see PR 3)

---

## PR 2 — Design-level generics (Phase 4) — ✅ DONE (4a + 4b; 4c/4d deferred)

**Status:** Implemented and green. Commit `aeb9d33` on branch
`pr2-design-generics` (off `pr1-restore-type-passthrough`). `npm test` passes
end-to-end (typecheck + lint + build + 333 unit tests across 27 files, exit 0)
and `npm run typecheck:examples` is clean (examples symlink the freshly-built
`dist`, so they exercise the new types). 4a and 4b shipped; 4c and 4d were
intentionally deferred (see below). **Next up: PR 3** (CI + runtime hardening).

**4a — done as written.** `StoreConfig<TTable>` constrains `columns` keys to
`keyof TTable['_']['columns']` (typos are compile errors; valid keys
autocomplete), falling back to untyped `ColumnAnnotations` for the base `Table`.
`validateAnnotations()` remains the runtime backstop — the existing runtime test
([QA-10205], which passes a non-existent column) now carries a `@ts-expect-error`
so it documents the compile-time guard *and* exercises the runtime throw.

**4b — done, with the ctx recommendation accepted.** Added module-private
`SoftDeleteCRUD<TTable>` (mirrors the runtime shapes: `restore` / `forceDestroy`
return the row, `forceDestroyAll` / `countWithDeleted` return `number`,
`findWithDeleted` returns rows). Threaded a third `TSoftDelete extends boolean`
param through `StoreDefinition → InferStore → Store` and
`RepositoryContext → Ctx → CustomQueryFn`. The `softDelete: true` literal is
captured via **overloads** on `defineStore()` and `StoriumInstance.defineStore`
(not a `const`/`TConfig` capture) — overload resolution is assignability-based,
so it sidesteps boolean-literal widening *and* the `conflictTarget: string[]`
↔ `readonly` friction a `const` type-param would have caused (plan risk #3:
readable > maximally-inferred). `StoreDefinition` carries a runtime
`softDelete: TSoftDelete` field so `InferStore` can surface the methods on the
`register()` path; the simple `db.defineStore()` path surfaces them via the
overload return types.

  - **ctx decision (4b-5): accepted — added to both runtime and type.** The
    runtime ctx assembly (was `repository.ts:749-773`) now spreads the
    soft-delete operations into `ctx` when `softDelete: true`, gated at the type
    level by `RepositoryContext`'s `TSoftDelete`. Rationale: without it there's
    an asymmetry — the store exposes `restore()` but a *custom query* (exactly
    where you'd compose multi-step soft-delete logic) couldn't reach
    `ctx.restore`. The cascade is bounded because the new param defaults to
    `false`, so every bare `Ctx` / `RepositoryContext<D, TTable>` usage (incl.
    all standalone `examples/*/entities/*/*.queries.ts` files) is unaffected.
    Bare-`Ctx` files on a soft-delete store still won't see `ctx.restore` in the
    type (they default `TSoftDelete = false`) — the same accepted looseness as
    bare `Ctx` getting `any` for `ctx.drizzle`. Guarded by a runtime test
    ([QA-10299]) that composes `ctx.findWithDeleted` + `ctx.restore`.

**Refinement vs. the written plan:**
  - The inner `.queries()` chain lambda in `makeStoreDefinition` returns `any`
    (annotated) rather than a precise type: a non-generic lambda can't carry the
    per-call `TFns`, and TS's higher-order assignment check rejects a fixed
    return. Consumers still get the precise `TQueries & TFns` from
    `StoreDefinition`'s declared `queries` signature — only the internal lambda
    is loose. The original 2-param code got away without this because inference
    produced `any` for the queries slot; the added `TSoftDelete` param forced an
    explicit thread, hence the explicit cast.
  - `SoftDeleteCRUD` is **module-private** (not exported), matching its sibling
    `DefaultCRUD`. fallow's dead-export check flagged it when briefly exported;
    consumers get the soft-delete method types through `Store<T, Q, true>`.

**4c / 4d — intentionally deferred (not in this PR).** Both are flagged STRETCH
in the plan and gated on "only if 4a/4b land without generics pain / don't make
error messages worse."
  - **4c (hidden-column `Omit` projection):** requires capturing per-column
    `hidden: true` *literals* from config — i.e. the literal `TConfig` capture
    the overload approach deliberately avoids. Reintroducing it (or `const` type
    params) brings back boolean-literal widening / `readonly` friction and
    interacts awkwardly with the `includeHidden` escape hatch (returns the full
    row). Plan itself hedges ("pre-1.0 simplicity has value too"). Skipped.
  - **4d (typed mixin results):** self-contained and doesn't build on the 4a/4b
    chain; adds its own generics surface to `belongsTo`/`hasMany`/`hasOne`/
    `withMembers`. Deferred to keep this PR's blast radius to the core type
    chain. Candidate for a focused follow-up while breaking changes are free.

**Verification (this PR):** type tests in
`src/store/__tests__/typed-store.test.ts` (enforced by `npm run typecheck`):
soft-delete store exposes `restore()` on both the `register()` and
`db.defineStore()` paths and inside `ctx`; a non-soft-delete store does **not**
(negative `@ts-expect-error` + `expectTypeOf(...).not.toHaveProperty`); a column
typo in `columns` config is a compile error (`@ts-expect-error`, non-vacuous
since tsc flags unused directives). Runtime guard: [QA-10299] in
`softDelete.test.ts`.

---

### Original plan (for reference)

Pre-1.0 breaking changes are free; these change public type signatures.

### 4a. Typed column keys in `StoreConfig`

```ts
export type StoreConfig<TTable extends Table = Table> = {
  columns?: Table extends TTable
    ? ColumnAnnotations                                       // fallback: untyped
    : { [K in keyof TTable['_']['columns']]?: ColumnAnnotation }
  softDelete?: boolean
  conflictTarget?: string[]   // optionally: (keyof TTable['_']['columns'] & string)[]
}
```

Update `defineStore` (`src/store/define.ts:314`) and
`StoriumInstance.defineStore` to take `StoreConfig<TTable>`. Runtime unchanged;
`validateAnnotations` stays as the runtime backstop.

### 4b. Soft-delete methods become visible to TypeScript

Currently `restore` / `forceDestroy` / `forceDestroyAll` / `findWithDeleted` /
`countWithDeleted` exist at runtime (`src/store/repository.ts:682-703`) but not
in `Store<TTable>`.

1. Add a `SoftDeleteCRUD<TTable>` type in `src/types.ts` mirroring the runtime
   shapes (returns `InferRow<TTable>`, filters `Partial<InferInput<TTable>>`).
2. Capture the literal: `defineStore<TTable, TConfig extends StoreConfig<TTable>>(table, config?: TConfig)`
   → `StoreDefinition<TTable, {}, TConfig extends { softDelete: true } ? true : false>`.
3. Add the boolean param through the chain:
   `StoreDefinition<TTable, TQueries, TSoftDelete>` →
   `Store<TTable, TQueries, TSoftDelete>` =
   `DefaultCRUD<TTable> & (TSoftDelete extends true ? SoftDeleteCRUD<TTable> : {}) & ...`.
4. Surface `softDelete` as a field on `StoreDefinition` (runtime value already in
   `table.storium.softDelete`) so `InferStore` can pick it up:
   `T extends { tableDef: ...; queryFns: ...; softDelete: infer SD } ? ...`.
5. **Decision to make during implementation:** also expose the soft-delete
   methods on `ctx` (runtime currently does NOT put them on ctx — the explicit
   list at `src/store/repository.ts:749-773` omits them). Recommendation: add
   them to both ctx runtime and `RepositoryContext` type when
   `softDelete: true`, so custom queries can compose `ctx.restore` etc.

### 4c. Stretch (evaluate after 4a/4b): hidden-column projection

With `const`-inferred config, `hidden: true` keys are known as literal types →
`Omit` them from public row types, fixing the current type lie (e.g. `findOne`
claiming to return `password` that runtime strips). Tension: `includeHidden`
escape hatch returns the full row. Keep the `Omit` on public store methods only.
**Only do this if 4a/4b land without generics pain** — it multiplies type
complexity and pre-1.0 simplicity has value too.

### 4d. Stretch: typed mixin results

`belongsTo` returns `(id) => Promise<any>` (`src/mixins/belongsTo.ts:49`). With
related table type + alias literal available, the result could be
`InferRow<TTable> & { [K in keyof RelatedCols as `${A}_${K & string}`]: ... }`.
Same pattern for `hasMany` / `hasOne` / `withMembers`. Worth doing while breaking
changes are free, but after the core chain is solid.

### Verification for PR 2

- Type tests: `softDelete: true` store exposes `restore` (and a non-soft-delete
  store does NOT — use `expectTypeOf(...).not.toHaveProperty` or a negative
  `@ts-expect-error` test); column-key typo in `columns` config is a compile
  error; mixin keys still compose.
- All existing unit + integration tests pass unchanged (runtime untouched except
  optional ctx additions in 4b-5).

---

## PR 3 — CI + runtime hardening (Phase 5) — ✅ DONE

**Status:** Implemented and green. Commit `30c58f7` on branch `pr3-ci-hardening`
(off `main`). `npm test` passes end-to-end (typecheck + lint + build + 335 unit
tests across 27 files, exit 0 — the two new tests are QA-10401/QA-10402) and
`npm run typecheck:examples` is clean. The CI YAML validates clean under
`actionlint`. **Next up: PR 4** (sweeps), branched off this branch.

**5a — done, with refinements.** `.github/workflows/ci.yml` runs on push/PR to
`main` with four jobs exactly as scoped: **lint** (`npm run lint`), **typecheck**
(`tsc -p tsconfig.check.json --noEmit` + `typecheck:examples`), **unit** (matrix
Node 20.x/22.x, `npm run build` + `npm run test:run`), **integration**
(ubuntu-latest, `npm run test:integration` — testcontainers against the running
Docker daemon). Refinements discovered during implementation:
  - **Examples need a built `dist` *and* per-example install** to typecheck. Each
    example depends on `storium` via `file:../..` (npm symlinks it), so its
    `import 'storium'` resolves to the package's `exports` → `./dist/*`; and
    `drizzle-orm`/`zod` resolve by parent-directory traversal up to the **root**
    `node_modules` (examples are nested in the repo). So the typecheck job does:
    `npm ci` → `npx tsc -p tsconfig.check.json` → `npm run build` →
    `npm install` in each `examples/*/` → `npm run typecheck:examples`.
  - Used the existing **`test:run`** (`vitest run`) and **`test:integration`**
    (`TEST_DIALECTS=memory,postgresql,mysql vitest run -c
    vitest.integration.config.ts`) scripts rather than re-spelling the vitest
    invocation, so CI tracks the package scripts.
  - Added `permissions: contents: read` and a `concurrency` group with
    `cancel-in-progress` (cheap hardening). Release/publish workflow skipped, as
    the plan permits (manual `npm run release` until 1.0).

**5b — done.** Chose a new **`CONTRIBUTING.md`** (over the user-facing README
body) for the dev-environment notes, including the `npm rebuild better-sqlite3`
fix for the `NODE_MODULE_VERSION` mismatch when switching Node versions; the
README's new "Contributing" section links to it.

**5c — done as written; line numbers confirmed.** Both warn-and-continue sites
were the *discovery/collection* import helpers, exactly at the cited lines:
`importAndCollect`'s catch in `src/migrate/seed.ts:112-117` and the collect loop
in `src/migrate/collector.ts:88-93`. Both now `throw new ConfigError(...)`
(from `src/errors.ts`) — a typo'd config file is a configuration problem, and
`ConfigError` is more precise than a bare `Error`. Pre-1.0: fatal, no opt-out
flag. The seed *runner*'s own per-file try/catch (`seed.ts:~234`) already failed
loudly (returns `{ success: false }`) and was left unchanged.
  - **Tests:** added **QA-10401** (`schema.collector.test.ts`) and **QA-10402**
    (`seed.test.ts`), each asserting `.rejects.toThrow(/Failed to import/)`,
    backed by a new fixture `fixtures/broken/bad.table.ts` that throws at import
    time. The fixture lives under a dedicated `broken/` dir so the existing
    `entities/*` globs never pick it up, and is covered by knip's existing
    `fixtures/**` entry pattern. Non-vacuous: the old warn-and-continue path
    *resolved* instead of rejecting, so both tests fail without the source change.
  - Naming note for reviewers: the collector's test file is
    `src/migrate/__tests__/schema.collector.test.ts` (source is `collector.ts`).

---

### Original plan (for reference)

### 5a. GitHub Actions

`.github/workflows/ci.yml`, triggered on push/PR to main:

- **lint job:** `npm run lint` (oxlint + knip + dependency-cruiser + ast-grep —
  whatever the unified lint script already runs)
- **typecheck job:** `npx tsc -p tsconfig.check.json --noEmit` +
  `npm run typecheck:examples`
- **unit job:** matrix Node 20.x / 22.x, `npm run build` + unit vitest
- **integration job:** ubuntu-latest (Docker available for testcontainers),
  `vitest -c vitest.integration.config.ts` — runs postgres/mysql containers
- Release workflow (tag-triggered publish) optional — manual `npm run release`
  is acceptable for now; revisit at 1.0.

### 5b. Fix local test environment

`npm rebuild better-sqlite3` resolves the NODE_MODULE_VERSION 127 vs 137
mismatch (72 failing unit tests). Document the rebuild step in README or
CONTRIBUTING for anyone switching Node versions.

### 5c. Make migrate import errors fatal

- `src/migrate/seed.ts:112-117` — seed file import failure: throw instead of
  warn-and-continue.
- `src/migrate/collector.ts:88-93` — schema file import failure: throw. A typo'd
  schema file silently producing incomplete migrations is the worst failure mode
  the CLI has.
- Pre-1.0: fail hard, no opt-out flag. Update the affected tests
  (`seed.test.ts`, `schema.collector.test.ts`).

---

## PR 4 — Sweeps (Phase 6)

| Item | File | Change |
|---|---|---|
| Tree-shaking hint | `package.json` | add `"sideEffects": false` |
| Type precision | `tsconfig.json:22` | `exactOptionalPropertyTypes: true`, fix fallout (timebox; revert if fallout is large) |
| Stale agent docs | `AGENTS.md` | rewrite Project Structure to actual layout (`src/store/`, `src/schema/`, `src/assertions.ts`, `src/migrate/collector.ts` — no `src/core/`) |
| Library logging | `src/connect.ts:319`, `src/migrate/*` | optional `logger` in `StoriumConfig` defaulting to console (or defer — low priority) |
| Docs | `docs/type-safety.md` | document the new inference behavior: table→dialect, query signature preservation, soft-delete typing |
| MySQL race docs | `docs/` | surface the no-RETURNING update-then-select caveat (already in code comments at `src/store/repository.ts:216-221`) |

---

## Open questions / risks

1. **Contextual typing through generic constraints** (PR 1) is the linchpin —
   if a TS version quirk breaks ctx inference for unannotated `(ctx) =>`
   factories, fall back to a curried builder
   (`.queries(q => ({ ... }))` where `q` injects the typed ctx). Type tests will
   catch this immediately.
2. **Dialect mismatch friction** (PR 1 Phase 2): pgTable + memory connection in
   tests gets pg-typed ctx. Acceptable; document.
3. **Generics complexity budget** (PR 2): if `TConfig` literal capture makes
   error messages unreadable, prefer two explicit params
   (`StoreDefinition<TTable, TQueries, TSoftDelete>`) over deeply conditional
   inference. Readable errors > maximal inference.
4. **`exactOptionalPropertyTypes` fallout** (PR 4) is unknown-size; it's last
   for a reason.
