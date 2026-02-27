# Storium TODO

Remaining work for a production-ready release.

## Default CRUD Options and Pagination

- [ ] Consider a cursor-based pagination option as an alternative to
      offset-based.

## Test Coverage

- [ ] **Dialect mapping** (`dialect.ts`): column building for all 11 types
      across all 3 dialects, including `primaryKey`, `notNull`, `default`,
      `custom`, and `raw` modes.
- [ ] **defineTable / defineStore**: table construction, access derivation
      (`mutable`, `writeOnly`, `required`), index building, constraints.
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
- [ ] **Seed runner**: `defineSeed`, `seed` ordering and execution.
- [ ] **Error classes**: `ValidationError`, `ConfigError`, `SchemaError`
      structure and messages.
