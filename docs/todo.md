# Storium TODO

Remaining work to get from v0.1.x to a fully realized, production-ready
release.

## MySQL Compatibility

- [ ] `create()` and `update()` in `createRepository.ts` use `.returning()`,
      which MySQL does not support. Need a dialect-aware path that falls back
      to a separate SELECT after insert/update on MySQL.
- [ ] `withMembers` uses `count(*)::int`, a Postgres-specific cast. Use a
      dialect-agnostic count expression or branch by dialect.
- [ ] `destroyAll` reads `result.rowCount ?? result.changes ?? 0` but does not
      account for MySQL's result shape. Verify and handle all three dialects.
- [ ] Audit all raw SQL fragments across the codebase for dialect-specific
      syntax.

## Default CRUD Options and Pagination

- [ ] Add an options argument to `find()`, `findAll()`, and `findOne()` that
      supports `limit`, `offset`, and `orderBy`.
- [ ] Consider a cursor-based pagination option as an alternative to
      offset-based.
- [ ] Ensure `orderBy` accepts both single columns and arrays of
      column/direction pairs.

## CLI Build and Distribution

- [ ] `bin/storium.ts` imports from `../src/` paths, but tsup only builds
      `index`, `config`, and `migrate` entry points. The CLI binary likely
      doesn't work from a published package. Either add `bin/storium.ts` as a
      tsup entry point or restructure imports to use the built package paths.
- [ ] `schemaCollector.ts` uses dynamic `import()` to load schema files at
      runtime, which requires pre-compiled JS or a TS-aware runtime (tsx,
      ts-node). Document this requirement or handle it in the CLI.
- [ ] The `status` migration command tries `drizzleKit.check()` which may not
      exist in the drizzle-kit API. Falls back to printing paths without
      actually checking applied migrations. Either implement properly or remove.

## Type Safety

- [ ] CRUD methods all return `Promise<any>`. Wire the compile-time type
      utilities (`SelectType`, `InsertType`, `UpdateType`) into the actual
      repository method signatures so consumers get typed returns.
- [ ] `db` is typed as `any` everywhere (`connect.ts`, `createRepository.ts`,
      `types.ts`). Explore using Drizzle's generic database types or at minimum
      narrowing by dialect.
- [ ] `table` and `selectColumns` are `Record<string, any>`. Tighten where
      possible.
- [ ] `tx` option is `any`. Type it against Drizzle's transaction type.

## Test Coverage

- [ ] **Dialect mapping** (`dialect.ts`): column building for all 11 types
      across all 3 dialects, including `primaryKey`, `notNull`, `default`,
      `custom`, and `raw` modes.
- [ ] **defineTable / defineStore**: table construction, access derivation
      (`mutable`, `hidden`, `required`), index building, constraints.
- [ ] **createRepository**: all 9 default CRUD operations, `force` option,
      transaction passthrough, custom queries receiving correct `ctx`.
- [ ] **Zod schema generation** (`zodSchema.ts`): all 4 schema variants,
      transforms, validation via `test()`, required/optional handling.
- [ ] **JSON Schema generation** (`jsonSchema.ts`): output correctness for all
      column types.
- [ ] **RuntimeSchema**: `validate`, `tryValidate`, `toJsonSchema`, `.zod`
      access.
- [ ] **Assertions**: all 7 built-in assertions, custom assertion registration.
- [ ] **Prep pipeline**: expand beyond the existing 6 tests to cover edge
      cases (async transforms, multiple validation errors, `force` bypass).
- [ ] **Helpers**: `withBelongsTo`, `withMembers`, `withCache`,
      `withTransaction`.
- [ ] **Connect / fromDrizzle**: instance creation, `withTransaction` on the
      instance, helper composition.
- [ ] **Migration commands**: `generate`, `migrate`, `push`, `status`.
- [ ] **Schema collector**: glob resolution, `.table` extraction from exports.
- [ ] **Seed runner**: `defineSeed`, `runSeeds` ordering and execution.
- [ ] **Error classes**: `ValidationError`, `ConfigError`, `SchemaError`
      structure and messages.

## Smaller Fixes

- [ ] **Duplicate `createWithTransaction`**: identical implementations exist in
      `helpers/withTransaction.ts` and inline in `connect.ts`. The connect
      version should import from helpers.
- [ ] **`withCache` invalidation assumption**: `delPattern` uses
      `${tableName}:*` but nothing enforces that user-defined cache keys use
      the table name as prefix. Document the convention or derive the prefix
      automatically.
- [ ] **JSON Schema for `jsonb`**: currently `{ type: 'object' }`, which
      rejects arrays. Consider `{}` (any) or `{ oneOf: [{ type: 'object' },
      { type: 'array' }] }`.
- [ ] **`bigint` in JSON Schema**: maps to `{ type: 'integer' }` which doesn't
      represent JavaScript BigInt values. Consider `{ type: 'string' }` or
      document the limitation.
- [ ] **SQLite `timestamp` mismatch**: dialect maps to `text()` but Zod
      schema uses `z.coerce.date()`. Ensure round-trip correctness or document
      the expected format.
- [ ] **`require()` in ESM package**: `connect.ts` and `dialect.ts` use
      `require()` for lazy dialect loading in a `"type": "module"` package.
      Works via tsup transpilation but could break in strict ESM environments.
      Consider dynamic `import()` instead.
- [ ] **Hidden + required interaction**: a column with `hidden: true` and
      `required: true` cannot be set through `create()` without `force: true`.
      Decide if this is intentional and document it, or allow hidden required
      columns in the insert schema.
- [ ] **Committed `.DS_Store` files**: remove from git history
      (`git rm --cached`).
