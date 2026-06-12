# Storium Production-Readiness Report

**Date:** 2026-06-11
**Version surveyed:** 0.14.19
**Method:** Type behavior verified empirically with a `tsc` probe against source; repo health surveyed across build, tests, CI, runtime safety, and docs.

---

## TL;DR

The `ctx` type complaint is confirmed and precisely located: the multi-file pattern
(`defineStore().queries()`) gives an almost fully untyped `ctx`, and **both**
store-creation paths erase custom query signatures down to `(...args: any[]) => any`
on the resulting store. The root cause is two signatures that capture only the *key
names* of the query record, never the function types. Beyond types, the library is
structurally strong (build, docs, error handling) but has zero CI, a broken local
test environment, and a handful of runtime-safety gaps.

---

## Part 1 — Type pass-through (verified by probe)

| What | Simple path (`db.defineStore`) | Multi-file path (`defineStore` + `register`) |
|---|---|---|
| `ctx.findOne()` row type | ✅ typed | ❌ `any` |
| `ctx.drizzle` | ✅ `PgDatabase` | ❌ `any` |
| `ctx.table.<column>` | ❌ `any` | ❌ `any` |
| `where` callback table inside ctx CRUD | ❌ `any` | ❌ `any` |
| **Custom query signature on the live store** | ❌ erased | ❌ erased |
| Public store row types (`store.findOne`) | ✅ typed | ✅ typed |
| Public store `where` callback | ✅ typed | ✅ typed |
| `schemas.createSchema.validate()` return | ❌ `any` | ❌ `any` |
| `db.transaction(tx => ...)` handle | ❌ `any` | ❌ `any` |

### Root cause #1: `.queries()` captures keys, not function types (the big one)

Both `src/store/define.ts:68-70` and `src/types.ts:570-572` use this shape:

```ts
queries: <TKeys extends string>(
  fns: Record<TKeys, (ctx: RepositoryContext) => (...args: any[]) => any>
) => StoreDefinition<TTable, TQueries & Record<TKeys, (ctx: ...) => (...args: any[]) => any>>
```

TypeScript infers `TKeys` from the object's keys, but the *value* type stored in
`TQueries` is the literal `(...args: any[]) => any`. The actual signatures never
enter the type system, so when `Store`'s mapped type extracts the inner function
(`src/types.ts:434`), all it can recover is `(...args: any[]) => any`.

**Fix:** infer the whole record instead of just the keys:

```ts
queries: <TFns extends Record<string, (ctx: RepositoryContext<D, TTable>) => (...args: any[]) => any>>(
  fns: TFns
) => StoreDefinition<TTable, TQueries & TFns>
```

Contextual typing of `ctx` still flows from the generic constraint, and `TFns`
preserves each query's parameter list and return type end to end — through
`register()` too, since `InferStore` already threads `TQueries` correctly.

### Root cause #2: multi-file `.queries()` binds neither table nor dialect to ctx

`src/store/define.ts:69` types ctx as bare `RepositoryContext` — i.e.
`RepositoryContext<Dialect, Table>`. With the full dialect union,
`DrizzleDatabase` deliberately resolves to `any` (`src/types.ts:33`), and with the
base `Table`, every CRUD method falls back to `any` / `Record<string, any>`. The
simple path already binds `RepositoryContext<D, TTable>`; the multi-file path
needs `RepositoryContext<Dialect, TTable>` at minimum.

**Better (pre-1.0):** infer the dialect from the table type — a `PgTable` can only
run on `'postgresql'` — so `ctx.drizzle` is concrete even in the inert multi-file
definition.

### Root cause #3: four supporting types are loose

- **`ctx.table: TableDef`** (`src/types.ts:358`) — `TableDef` has an
  `[key: string]: any` index signature, so every column access is `any`.
  Should be `TTable & { storium: StoriumMeta }`.
- **`PrepOptions` isn't generic** (`src/types.ts:321`) — it extends `QueryOptions`
  with the `TTable = any` default, and `RepositoryContext` uses
  `DefaultCRUD<TTable, PrepOptions>`. So `where` callbacks inside custom queries
  get `table: any` even when everything else is typed. Make it
  `PrepOptions<TTable = any>` and pass `PrepOptions<TTable>` through.
- **`SchemaSet`/`RuntimeSchema` aren't bound to the table** (`src/types.ts:217-234`)
  — `validate()` returns `any`. Parameterize as `SchemaSet<TTable>` with
  `createSchema: RuntimeSchema<InferInsertModel<TTable>>`,
  `selectSchema: RuntimeSchema<InferSelectModel<TTable>>`,
  `updateSchema: RuntimeSchema<Partial<InferInsertModel<TTable>>>`.
- **`Promisable<T> = T | Promise<any>`** (`src/types.ts:587`) — a bug:
  `Promise<any>` instead of `Promise<T>` poisons any signature using it. Exported
  from `index.ts:100` but unused internally — fix or delete.

### Two type gaps that aren't about `any` but will bite real users

1. **Soft-delete methods are invisible to TypeScript.** When `softDelete: true`,
   the runtime store gains `restore`, `forceDestroy`, `forceDestroyAll`,
   `findWithDeleted`, `countWithDeleted` (`src/store/repository.ts:682-703`) —
   but `Store<TTable>` never declares them, so `store.restore(id)` is a compile
   error for users. Fixing this properly means making `StoreConfig` generic
   enough to know `softDelete: true` at the type level and conditionally
   extending the store type.
2. **`StoreConfig.columns` keys are untyped strings.** Typos in annotation keys
   are only caught at runtime by `validateAnnotations`. Making it
   `{ [K in keyof TTable['_']['columns']]?: ColumnAnnotation }` gives
   autocomplete and compile-time typo detection — and once `hidden` keys are
   known as literal types, they could be `Omit`ted from row types, fixing the
   current lie where `findOne` claims to return columns the runtime strips
   (e.g. `password`).

Also noted: mixins (`belongsTo` et al.) type their method *names* via template
literals but return `(id) => Promise<any>` (`src/mixins/belongsTo.ts:49`). With
the related table's type available, the join result could be a mapped type with
prefixed keys. Lower priority, same theme.

There are ~104 `: any` / `as any` occurrences in non-test src. Many are justified
(Drizzle's unexported query-builder types), but the existing type test file
(`src/store/__tests__/typed-store.test.ts`) only asserts that `tableDef`
round-trips — none of the failures above are covered.

---

## Part 2 — Broader production readiness

### Critical

- **No CI/CD at all.** No GitHub Actions, no lint/typecheck/test gates, manual
  `npm run release`. Excellent local tooling exists (oxlint, knip,
  dependency-cruiser, ast-grep) but nothing enforces it.
- **Local test suite currently broken:** 72 of 264 unit tests fail with a
  better-sqlite3 `NODE_MODULE_VERSION 127 vs 137` mismatch — an environment
  issue (`npm rebuild better-sqlite3`), but there's no trustworthy green/red
  signal locally and no CI to catch it elsewhere.

### High

- **Seed and schema-file import errors are warn-and-continue**
  (`src/migrate/seed.ts:112-117`, `src/migrate/collector.ts:88-93`). A syntax
  error in a schema file silently produces incomplete migrations. Should be
  fatal, or fail by default with an opt-out.
- **Integration tests exist (11 files, testcontainers, multi-dialect) but
  `npm test` never runs them** — they need a CI job with Docker.
- `exactOptionalPropertyTypes: false` in tsconfig weakens type precision.

### Medium / low

- No `"sideEffects": false` in package.json (hurts tree-shaking).
- `console.warn` / `console.log` used directly in library code
  (`src/connect.ts:319`, migrate commands) — no way to silence or redirect;
  consider an optional logger.
- Transaction isolation levels aren't configurable; MySQL's no-RETURNING
  update-then-select race is documented in code but worth surfacing in user docs.
- **AGENTS.md is stale**: documents `src/core/`, `configLoader.ts`,
  `runtime.schema.ts`, etc., but the actual layout is `src/store/`,
  `src/schema/`, `src/assertions.ts`, `src/migrate/collector.ts`. It actively
  misleads contributors and agents.

### Already strong (no action needed)

Dual ESM/CJS exports with correct types fields, externalized peer deps, strict
mode + `noUncheckedIndexedAccess`, structured error classes with per-dialect
constraint mapping, pool teardown on connect failure, idempotent disconnect,
safe non-shell spawning in migrate, comprehensive docs (7 doc files, 11 examples
with READMEs), well-maintained changelog.

---

## Recommended order of attack

1. **Fix the `.queries()` signature erasure** (root cause #1) — highest
   value-to-effort; one signature change in two places restores end-to-end
   typing for every custom query.
2. **Bind table + dialect into multi-file ctx** (root cause #2), including
   table-type→dialect inference.
3. **Tighten the supporting types** (`PrepOptions<TTable>`, `ctx.table`,
   `SchemaSet<TTable>`, fix `Promisable`) and add `expectTypeOf` regression
   tests for all of it.
4. **Type the soft-delete surface and `StoreConfig.columns` keys** — the two
   design-level changes, best done now while breaking changes are free.
5. **Stand up CI** (lint + typecheck + unit on push; integration with Docker),
   fix the better-sqlite3 rebuild, make migrate import errors fatal.
6. Sweep the small stuff: `sideEffects`, `exactOptionalPropertyTypes`, logger
   config, refresh AGENTS.md.

See `production-readiness-plan.md` for the concrete implementation plan.
