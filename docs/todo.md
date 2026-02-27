# Storium TODO

Remaining work for a production-ready release.

## Default CRUD Options and Pagination

- [ ] Consider a cursor-based pagination option as an alternative to
      offset-based.

## Test Coverage

- [x] **Error classes**: `ValidationError`, `ConfigError`, `SchemaError`, `StoreError`.
- [x] **Assertions** (`test.ts`): all 7 built-in assertions, custom assertion registration.
- [x] **JSON Schema generation** (`jsonSchema.ts`): all DSL types, schema variants, required logic.
- [x] **Zod schema generation** (`zodSchema.ts`): types, transforms, validate callbacks, modes.
- [x] **RuntimeSchema**: `validate`, `tryValidate`, `toJsonSchema`, `.zod` access.
- [x] **Indexes** (`indexes.ts`): single/multi-column, unique, errors, raw escape hatch.
- [x] **defineStore**: StoreDefinition creation, type guard, error cases.
- [x] **defineTable**: metadata, access derivation, timestamps, PK detection, raw columns.
- [x] **createRepository**: full CRUD lifecycle, pagination, ref, custom queries, prep integration.
- [x] **Prep pipeline**: Promise resolution, onlyMutables, custom assertions, multi-error.
- [x] **Helpers**: `withBelongsTo`, `withMembers`, `withCache`.
- [x] **Connect / fromDrizzle**: instance creation, register, transaction, disconnect, assertions.
- [x] **Schema collector**: glob resolution, table extraction from exports.
- [x] **Seed runner**: `defineSeed`, `seed` ordering and execution.
- [x] **Migration commands**: `status` reporting.
- [ ] **Dialect mapping** (`dialect.ts`): column building for all 13 types
      across all 3 dialects (requires dialect-specific Drizzle mocking).
