# Type Safety in Storium

Storium wraps Drizzle ORM tables with validation, access control, and CRUD operations. This document explains what is statically typed, what remains `any`, and why.

## What's typed

**Drizzle table definitions** are fully typed. `pgTable()`, `sqliteTable()`, and `mysqlTable()` produce typed column maps, and Drizzle's `InferSelectModel<T>` / `InferInsertModel<T>` utilities derive row types from those definitions.

**Column introspection** (`src/core/introspect.ts`) reads Drizzle column metadata at runtime (`dataType`, `columnType`, `notNull`, `hasDefault`, `length`, `enumValues`) and maps it to Zod schemas and JSON Schema objects. The introspection input is typed via the `DrizzleColumn` interface in `src/types.ts`.

**Config and options** — `StoriumConfig`, `StoreConfig`, `ColumnAnnotation`, `QueryOptions`, `PrepOptions`, and `OrderBySpec` are all typed. The `where` callback returns `SQL | undefined` (from `drizzle-orm`).

**Dialect-aware database types** — `DrizzleDatabase<D>` resolves to the concrete Drizzle class (`PgDatabase`, `MySqlDatabase`, `BaseSQLiteDatabase`) when `D` is a specific dialect literal, providing full autocomplete inside custom queries that declare their dialect.

**Custom query context** — `RepositoryContext<D>` (aliased as `Ctx<D>`) types the `ctx` object passed to custom query factories, including the dialect-aware `drizzle` property.

## Intentional `any` — and why

### `DefaultCRUD` return types (`Promise<any>`)

Every default store method (`find`, `findById`, `create`, etc.) returns `Promise<any>`. The row shape depends on:

1. Which Drizzle table is bound (determines the columns)
2. Which columns are hidden (excluded from SELECT projection)
3. Whether `includeHidden` is set at call time

TypeScript cannot express "the SELECT projection of table T minus columns marked hidden in the storium annotation layer" without dependent types. A future `Store<T>` generic parameterized over the table type could narrow these via `InferSelectModel<T>`, but that would be a significant API change and is planned as a separate initiative.

### `QueriesConfig` — `(ctx: any) => ...`

Custom query factories are typed as `Record<string, (ctx: any) => (...args: any[]) => any>`. The `ctx` parameter is `any` because:

- User-defined queries have arbitrary signatures — storium cannot predict the return type or argument list.
- Mixin query factories (belongsTo, hasMany, etc.) compose across modules. Typing `ctx` here would introduce circular imports between `types.ts` and the mixin modules.
- The typed `RepositoryContext<D>` alias exists for consumers who want narrower typing on individual query functions.

### `ctx: any` in mixin return types

The `belongsTo`, `hasMany`, `hasOne`, and `withMembers` mixins use `ctx: any` in their return type signatures for the same composition/circular-import reasons as `QueriesConfig`. At runtime, `ctx` is always a `RepositoryContext`.

### Query builder variables (`q: any`)

Functions like `applyOrderBy(q, ...)` and `applyQueryOpts(q, ...)` in `repository.ts` accept `q: any`. Drizzle's fluent query builder type varies by dialect (`PgSelectBase`, `SQLiteSelectBase`, `MySQLSelectBase`) and is not publicly exported as a unified interface. All dialects expose `.orderBy()`, `.limit()`, and `.offset()`, so the runtime calls are safe.

### `(result as any).insertId`

Drizzle's MySQL insert result exposes `insertId` for auto-increment primary keys, but the result type is not publicly exported. This cast is the only way to retrieve auto-increment PKs on MySQL (which lacks `RETURNING`).

### `(row as any)[primaryKey]`

Dynamic property access on result rows using a runtime PK column name. The row type is unknown since it depends on the table's SELECT projection (see `DefaultCRUD` above).

### `TableDef` index signature

`TableDef` has `[key: string]: any` because it represents a Drizzle table object (whose column properties are dynamically named). Drizzle tables are keyed by user-chosen column names, so a static type cannot enumerate them.

## Future path: `Store<T>`

The main opportunity is making `Store` generic over the Drizzle table type:

```typescript
type Store<TTable extends Table, TQueries extends QueriesConfig = {}> = {
  find: (filters: Partial<InferInsertModel<TTable>>, opts?: QueryOptions) => Promise<InferSelectModel<TTable>[]>
  findById: (id: PkValue, opts?: QueryOptions) => Promise<InferSelectModel<TTable> | null>
  create: (input: InferInsertModel<TTable>, opts?: QueryOptions) => Promise<InferSelectModel<TTable>>
  // ...
}
```

This would require:

1. Threading the table type parameter through `defineStore`, `register`, and `createRepository`
2. Expressing the hidden-column exclusion at the type level (likely via mapped types)
3. Updating all mixin return types to be generic

This is a non-trivial change best tackled after the API stabilizes for 1.0.
