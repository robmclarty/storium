# `connect()`: per-connection password function (pg)

**Date:** 2026-09-08
**Status:** Spec, ready to absorb with `/plumbbob:plan docs/specs/2026-09-08-connect-password-function.md`
**Source:** [GitHub issue #6](https://github.com/robmclarty/storium/issues/6), filed 2026-09-08 (reproduced in this repo, see *Evidence*)
**Target:** storium 0.15.4 via `/version patch`, the same class of change as 0.15.3's `driverOptions`
**Size:** small
**Scope:** connect

## Summary

`storium.connect()` cannot express a **per-connection password function**, which is the
mechanism `pg` provides for rotating credentials: RDS IAM database authentication
(15-minute signed tokens), Cloud SQL IAM auth, Vault dynamic secrets. Today the only
route is dropping `connect()` for `fromDrizzle()` with a hand-built pool, which is
exactly what `driverOptions` (0.15.3) was meant to make unnecessary.

Two things block it, and the second one means the fix has to live in storium rather
than in the caller:

1. `driverOptions.password` is rejected by `assertDriverOptionsDoNotSetUrl` (deliberate,
   and the reasoning is right), and the typed alternative, `password?: string` on
   `StoriumConfig`, is string-only and gets folded into a URL string by
   `buildConnectionUrl`. A function has nowhere to go.
2. Even if it were allowed, `pg` would clobber it. `connect()` always passes
   `connectionString: url`, and `pg`'s `ConnectionParameters` does
   `Object.assign({}, config, parse(config.connectionString))`: the parsed DSN is the
   last writer on every key it emits, and a DSN with **no** password still parses to
   `password: ""`, so it overwrites a function too.

The fix: widen the `password` type to accept a function, and when it is a function on
the `postgresql` dialect, build the `pg.Pool` from discrete components with no
`connectionString`. Everything else (`driverOptions`, `pool.min`/`pool.max`, the URL-key
rejection) stays as it is.

## Evidence (verified 2026-09-08 in this repo)

Reproduced locally against the installed `pg` 8.19.0 by constructing a `pg.Client` and
reading `client.connectionParameters.password` (the issue measured the same on 8.22.0 /
`pg-connection-string` 2.14.0):

| Pool config | `connectionParameters.password` |
| -- | -- |
| `{ connectionString: 'postgres://u@h/db', password: fn }` | `null`, function lost |
| `{ connectionString: 'postgres://u:secret@h/db', password: fn }` | `"secret"`, function lost |
| `{ host, port, user, database, password: fn }` (no connectionString) | `fn`, survives |

Where the behaviour lives:

- `node_modules/pg/lib/connection-parameters.js:59-60`: the `Object.assign` that spreads
  the parsed DSN over the explicit config.
- `node_modules/pg/lib/client.js:250-270` (`_getPassword`): the
  `typeof this.password === 'function'` branch, resolved per new connection, called as
  `this.password(this.connectionParameters)`, and it rejects a non-string return with
  `TypeError('Password must be a string')`.
- `src/connect.ts` (`URL_COMPONENT_KEYS`, `assertDriverOptionsDoNotSetUrl`): the
  rejection of `driverOptions.password`.
- `src/connect.ts` (`case 'postgresql'`): the `new Pool({ ...config.driverOptions,
  connectionString: url, ...min/max })` call.
- `src/connect.ts` (`buildConnectionUrl` / `buildAuthHost`): `enc(password)` would
  coerce a function to its source text if one ever reached it.
- `src/types.ts` (`StoriumConfig`): `password?: string` on both the inline shape and
  `dbCredentials`.
- `node_modules/mysql2/typings/mysql/lib/Connection.d.ts:97`: mysql2 3.18.2's
  `password?: string`. No callback form exists. better-sqlite3 has no password at all.
- `node_modules/drizzle-kit/bin.cjs` (0.31.9): `dbCredentials.password` is validated as
  `string()`. A function there breaks `drizzle-kit generate` / `push` at drizzle-kit's
  own config validation (relevant to [Q1 (dbcredentials-shape)](#q1)).

## Frame

- **Problem:** rotating-credential setups (RDS IAM, Cloud SQL IAM, Vault) need `pg` to
  mint a fresh password for every connection the pool opens. `connect()` only carries a
  string password, folds it into a DSN, and hands `pg` a `connectionString`, which
  overwrites any function-valued `password` on the way in. Callers fall back to
  `fromDrizzle()` and lose `connect()`'s pool lifecycle, `pool.min`/`max` mapping and
  config normalisation for one option.
- **Smallest thing that solves it:** accept `password` as `string | (() => string |
  Promise<string>)`; on `postgresql`, when it is a function, construct `pg.Pool` from
  `host`/`port`/`user`/`database`/`password` (parsed from `url` if that is what was
  given) and omit `connectionString`, so pg never runs the DSN merge and resolves the
  function per connection. Reject the function on the other dialects and reject the
  ambiguous DSN shapes at `connect()`.
- **Done looks like:** `storium.connect({ dialect: 'postgresql', url:
  'postgres://app@host:5432/app', password: async () => signer.getAuthToken() })`
  opens a pool whose every new connection calls the function (integration test counts
  the calls); a function password on `mysql` / `sqlite` / `memory` throws `ConfigError`
  synchronously; existing string/URL configs produce a byte-for-byte identical `pg.Pool`
  config (QA-10417 through QA-10424 pass unchanged); docs carry the DSN-wins sentence.
- **Explicitly NOT doing:** always building from components (the DSN path carries query
  parameters like `sslmode` the component path cannot, so the string/URL path is left
  alone); translating DSN query parameters into pg options; a callback form for mysql2
  (no driver support); changing `fromDrizzle()`; a runnable `examples/` entry (an IAM
  flow cannot run in CI; the README snippet is the example); importing
  `pg-connection-string` (transitive, undeclared).

## Architecture sketch

```
StoriumConfig { dialect, url | host+port+user+database, password, pool, driverOptions }
        │
        ▼
createDrizzleInstance()
        │
        ├─ dialect ∈ { mysql, sqlite, memory } and typeof password === 'function'
        │        └──► ConfigError (D1)                      ← thrown at connect(), never at first query
        │
        ├─ dialect === 'postgresql' and typeof password === 'function'
        │        ├─ resolvePgComponents(config)             ← url ? parse with WHATWG URL : read config fields
        │        │      ├─ url carries a password  ──► ConfigError (D4)
        │        │      └─ url carries ?query      ──► ConfigError (D4, points at driverOptions)
        │        └──► new Pool({ ...driverOptions, host, port, user, database, password: fn, ...min/max })
        │                       ▲ no connectionString: pg never runs Object.assign(parse(dsn)), fn survives
        │
        └─ everything else (string password, or none)
                 └──► new Pool({ ...driverOptions, connectionString: url, ...min/max })   ← unchanged (D6)
```

## Decisions

- <a id="d1"></a>**D1 (pg-only)**: a function `password` is honoured on `postgresql` and is a
  `ConfigError` at `connect()` on `mysql`, `sqlite` and `memory`, *because* pg is the only
  driver with a per-connection password hook (mysql2 3.18 `password` is `string`,
  better-sqlite3 has none) and stringifying a function into a DSN is a silent failure.
- <a id="d2"></a>**D2 (components-not-dsn)**: on the function branch the pool is built from
  discrete `host`/`port`/`user`/`database`/`password` with no `connectionString`,
  *because* pg spreads the parsed DSN over explicit config and even a passwordless DSN
  emits `password: ""`, so the callback is lost on every DSN path (measured above).
- <a id="d3"></a>**D3 (url-still-works)**: a `url` given beside a function password is parsed
  into components with Node's WHATWG `URL`, *because* most configs carry a
  `DATABASE_URL` and forcing a move to component fields just to add a callback is the
  restructuring `driverOptions` was meant to end.
- <a id="d4"></a>**D4 (no-silent-drops)**: a DSN that carries a password, or any query string,
  beside a function password is a `ConfigError`, *because* the component branch cannot
  carry query parameters (`sslmode`, `application_name`, …) and two password sources is
  an ambiguity; refusing at `connect()` is the only non-surprise, the same rule
  `assertDriverOptionsDoNotSetUrl` already applies.
- <a id="d5"></a>**D5 (zero-arg-type)**: the public type is `() => string | Promise<string>`
  and the function is handed to pg untouched, *because* pg's extra
  `ConnectionParameters` argument is a driver internal that cannot appear in storium's
  types (drivers are optional peers), while passing the function through unchanged
  means pg still supplies that argument at runtime for anyone who wants it.
- <a id="d6"></a>**D6 (string-path-untouched)**: when `password` is a string or absent, the
  `connectionString: url` path is byte-for-byte what it is today, *because* the DSN
  path carries query parameters the component path cannot, and existing users must
  see no behaviour change.
- <a id="d7"></a>**D7 (error-class)**: every refusal is a `ConfigError` thrown synchronously
  from `connect()`, *because* that is the existing contract for config collisions
  (`driverOptions.connectionString`, unknown dialect); the alternative surfaces as a
  pg `error` event on the first checkout, minutes later and off the call stack.
- <a id="d8"></a>**D8 (docs-sentence)**: the `driverOptions` docblock and README gain the
  DSN-wins sentence the issue asked for, *because* it would have saved the reporter
  the measurement and it is the real reason URL components are rejected there.
- <a id="d9"></a>**D9 (pg-port-default)**: when the target has no port, storium passes no
  `port` and lets pg default (5432, or `PGPORT`), *because* pinning 5432 in storium
  would silently override an environment pg already honours.

## Constraints

- <a id="c1"></a>**C1 (no-new-deps)**: no new runtime dependencies; URL parsing is Node's
  built-in `URL`; no import of `pg-connection-string` or of `pg/lib/*` internals.
- <a id="c2"></a>**C2 (sync-connect)**: `connect()` stays synchronous and the drivers stay
  lazily `require`d inside the dialect switch.
- <a id="c3"></a>**C3 (peer-types-out)**: storium's public types import nothing from `pg`,
  `mysql2` or `better-sqlite3`; the function type is hand-written.
- <a id="c4"></a>**C4 (existing-tests-frozen)**: QA-10417 through QA-10424 in
  `src/__tests__/connect.test.ts` pass without edits.
- <a id="c5"></a>**C5 (qa-ids)**: new tests carry a `[QA-NNNNN]` name prefix continuing from
  QA-10425 (the registry at `.health/test-registry.json` stopped at QA-10400 and is not
  updated; the prefix is the only required annotation).
- <a id="c6"></a>**C6 (gate)**: `pnpm test` (typecheck, lint, build, unit) is green at every
  checkpoint; the integration step also passes
  `TEST_DIALECTS=postgresql pnpm run test:integration` locally (Docker).
- <a id="c7"></a>**C7 (no-example)**: no new `examples/` entry (CI runs
  `typecheck:examples` and `test:examples`; an IAM flow cannot run there).

## Design detail

### Type (`src/types.ts`, `src/index.ts`)

```ts
/**
 * A per-connection password source. pg calls it every time the pool opens a new
 * connection, so short-lived tokens (RDS IAM, Cloud SQL IAM, Vault) stay fresh.
 * postgresql only: a function here is a ConfigError on mysql / sqlite / memory.
 */
export type PasswordFn = () => string | Promise<string>

export type StoriumConfig<D extends Dialect = Dialect> = {
  // ...
  password?: string | PasswordFn
  dbCredentials?: {
    // ...
    password?: string          // unchanged, see Q1 (dbcredentials-shape)
  }
}
```

`PasswordFn` is exported from the barrel alongside `StoriumConfig` and `Logger`.
Because `exactOptionalPropertyTypes` is on, the union does not include `undefined`.

### Target resolution (`src/connect.ts`)

A new helper, used only on the pg function branch:

```ts
type PgTarget = { host: string; port?: number; user?: string; database: string }

const resolvePgTarget = (config: StoriumConfig): PgTarget
```

- **Components given** (`host`, `port`, `database`, `user` from the inline shape, then
  `dbCredentials`, the same precedence `buildConnectionUrl` uses today): return them.
  Missing `host` or `database` is the existing
  `'Either \`url\` or \`host\` + \`database\` must be provided'` `ConfigError`.
- **`url` given** (`resolveUrl(config)`): `new URL(url)`. Verified shapes on Node 24:
  - `username` and `pathname` come back percent-encoded (`app%40corp`, `/app%2Fx`):
    `decodeURIComponent` both; `database` is `pathname.slice(1)`.
  - `port` is `''` when absent: pass no `port` ([D9 (pg-port-default)](#d9)).
  - IPv6 comes back bracketed (`[::1]`): strip the brackets, mirroring
    `pg-connection-string`.
  - `password !== ''` on the URL: `ConfigError` ([D4 (no-silent-drops)](#d4)).
  - `search !== ''`: `ConfigError` naming the parameters and pointing at
    `driverOptions` ([D4 (no-silent-drops)](#d4)). This also covers the unix-socket
    form `postgresql:///db?host=/var/run/postgresql`.
  - `hostname === ''` (no host) or `pathname` of `/` (no database): the existing
    `host` + `database` `ConfigError`.
- Precedence between an inline function and a `dbCredentials.password` string stays
  what it is today: inline wins (`config.password ?? config.dbCredentials?.password`).
  This is what lets one shared config file give drizzle-kit a static
  `dbCredentials.password` and give `connect()` the function.

### The pg branch (`src/connect.ts`, `case 'postgresql'`)

```ts
assertDriverOptionsDoNotSetUrl(config.driverOptions, 'connectionString')   // unchanged
const password = config.password ?? config.dbCredentials?.password
const pool = typeof password === 'function'
  ? new Pool({
      ...config.driverOptions,
      ...resolvePgTarget(config),          // host, port?, user?, database
      password,                            // the function, untouched (D5)
      ...(config.pool?.min !== undefined && { min: config.pool.min }),
      ...(config.pool?.max !== undefined && { max: config.pool.max }),
    })
  : new Pool({                             // byte-for-byte today's call (D6)
      ...config.driverOptions,
      connectionString: url,
      ...(config.pool?.min !== undefined && { min: config.pool.min }),
      ...(config.pool?.max !== undefined && { max: config.pool.max }),
    })
```

`driverOptions` is still spread first so storium's keys win on collision, and the
URL-component keys are still rejected before this point, so `driverOptions` can never
carry a competing `host` / `password`.

The `url` computed at the top of `createDrizzleInstance` (`resolveUrl(config) ??
buildConnectionUrl(config)`) must not run `buildConnectionUrl` with a function password:
either compute `url` lazily inside the string branch, or have `buildConnectionUrl` throw
`ConfigError` on a function (a defensive guard that makes the `enc(password)` coercion
unreachable, [D1 (pg-only)](#d1)).

### Refusals (exact `ConfigError` messages)

- **mysql / sqlite / memory, function password:**
  `` `password` as a function is only supported on the postgresql dialect, where pg resolves it once per connection. The '<dialect>' driver takes a string and has no per-connection hook. Resolve the credential yourself and pass a string, or use fromDrizzle() with a pool you manage. ``
- **DSN carries a password beside a function:**
  `` `password` is a function but `url` already carries a password: one source only. Remove the password from the URL, or remove the function. ``
- **DSN carries query parameters beside a function:**
  `` `password` is a function, so the pg pool is built from host/port/user/database instead of a connection string, and the URL's query parameters (<names>) would be dropped. Move them into `driverOptions` (for example `?sslmode=require` becomes `driverOptions: { ssl: ... }`) and remove them from the URL. ``

### Docs text

- `src/types.ts`, `driverOptions` docblock, one sentence (the issue's wording, kept
  nearly verbatim): *"pg merges the parsed `connectionString` over these options, so any
  key a DSN can carry (`ssl`, `password`, `host`, …) is won by the DSN; storium rejects
  the URL components for that reason. Strip `ssl*` query params from your DSN if you set
  `ssl` here."*
- `src/types.ts`, `password` docblock: string or `PasswordFn`; pg only; per-connection;
  the two DSN refusals.
- `README.md`, *Driver options* section: the DSN-wins sentence, then a short
  *Rotating credentials* snippet (`password: async () => signer.getAuthToken()` with an
  RDS IAM comment) noting it is postgresql-only and that `ssl` goes in `driverOptions`.
- `docs/api-reference.md`, *Configuration* table: a `PasswordFn` row.
- `docs/migrations.md`, *Config Keys* table: a `password` row, "Storium; string, or on
  postgresql a per-connection function; keep `dbCredentials.password` a string because
  drizzle-kit validates it".
- `AGENTS.md`, *StoriumConfig* section: one line on `password` as a function
  (postgresql only, component-built pool) so agents stop steering people at
  `fromDrizzle()`.
- `CHANGELOG.md`: a new `## Unreleased` section at the top (the `/version` skill folds
  it into the release entry), one **Password function** bullet plus one bullet for the
  docblock sentence.

### Tests

Unit, in `src/__tests__/connect.test.ts`, a new `describe('password function')` block
reusing the `pgOptions` / `mysqlPoolConfig` helpers and the port-1 URLs (nothing dials):

| ID | Asserts |
| -- | -- |
| QA-10425 | mysql + function password throws `ConfigError` synchronously, message names `postgresql` |
| QA-10426 | memory + function password throws `ConfigError` synchronously |
| QA-10427 | pg, components + function: `options.connectionString` is `undefined`; `host`/`port`/`user`/`database` equal the config; `options.password` is the same function reference (`toBe(fn)`) |
| QA-10428 | pg, `url` with percent-encoded user, explicit port, no password + function: components decoded and parsed; no `connectionString`; `options.password` is `fn` |
| QA-10429 | pg, `url` without a port + function: `options.port` is `undefined` ([D9 (pg-port-default)](#d9)); bracketed IPv6 host comes out unbracketed |
| QA-10430 | pg, function branch keeps `driverOptions.ssl` and `pool.min`/`pool.max` (and `pool` wins over `driverOptions.min/max`, as QA-10418 does on the string branch) |
| QA-10431 | pg, `url` that carries a password + function throws `ConfigError` naming both sources |
| QA-10432 | pg, `url` with `?sslmode=require` + function throws `ConfigError` whose message names `sslmode` and `driverOptions` |
| QA-10433 | pg, string `password` + components still yields `connectionString` with the encoded password and no `options.password` ([D6 (string-path-untouched)](#d6)) |

Integration, in `test/integration/connect.test.ts`, `postgresql` only (the test starts
its own `PostgreSqlContainer` so it can read the container's password; skipped when
`TEST_DIALECTS` excludes postgresql):

| ID | Asserts |
| -- | -- |
| QA-10434 | with `pool: { max: 2 }` and a counting `password: async () => { calls++; return container.getPassword() }`, `Promise.all` of two `SELECT 1` queries yields `calls === 2`; a third sequential query reuses an idle client and `calls` stays 2 |
| QA-10435 | a function that returns the wrong password rejects the first query with pg's auth error (`28P01`), proving the function's return is what pg sends |

## Steps

1. [ ] feat(types): accept a function for StoriumConfig.password, **done when:** `pnpm run typecheck` is green with a new `expectTypeOf` case in `src/store/__tests__/typed-store.test.ts` showing `{ dialect: 'postgresql', host: 'h', database: 'd', password: async () => 'x' } satisfies StoriumConfig` compiles and `PasswordFn` is importable from `storium`
   - seam: `src/types.ts`, `src/index.ts`, `src/store/__tests__/typed-store.test.ts`
   - model: sonnet (mechanical, fully specified by the type block above)
2. [ ] feat(connect): refuse a function password outside postgresql, **done when:** QA-10425 and QA-10426 pass, and `buildConnectionUrl` throws `ConfigError` rather than stringifying if it ever receives a function
   - seam: `src/connect.ts`, `src/__tests__/connect.test.ts`
   - model: sonnet (two guards and two tests)
3. [ ] feat(connect): build the pg pool from components for a function password, **done when:** QA-10427 through QA-10430 and QA-10433 pass and QA-10417 through QA-10424 pass unchanged
   - seam: `src/connect.ts`, `src/__tests__/connect.test.ts`
   - model: opus (the URL-to-components parsing has the edge cases the tests pin: encoded user, IPv6 brackets, absent port)
4. [ ] feat(connect): refuse DSN passwords and query params beside a function, **done when:** QA-10431 and QA-10432 pass with the messages in *Refusals*
   - seam: `src/connect.ts`, `src/__tests__/connect.test.ts`
   - model: sonnet (fully specified)
5. [ ] test(integration): pg calls the password function per pooled connection, **done when:** QA-10434 and QA-10435 pass under `TEST_DIALECTS=postgresql pnpm run test:integration` and the memory-only run still passes with both skipped
   - seam: `test/integration/connect.test.ts`
   - model: sonnet (Docker-backed but the assertions are spelled out)
6. [ ] docs(connect): document function passwords and the DSN-wins rule, **done when:** every file in the seam carries the text in *Docs text*, `## Unreleased` heads `CHANGELOG.md`, and `pnpm run lint` is green
   - seam: `README.md`, `src/types.ts`, `docs/api-reference.md`, `docs/migrations.md`, `AGENTS.md`, `CHANGELOG.md`
   - model: sonnet (prose from a fixed brief)

## Open questions

- <a id="q1"></a>**Q1 (dbcredentials-shape)**: should `dbCredentials.password` widen to the
  function type too, as the issue proposes, or stay `string`?, *resolve by:* decide
  - *plain:* `dbCredentials` is the drizzle-kit shape, and drizzle-kit 0.31.9 validates
    `dbCredentials.password` as a string when `generate` / `push` load the shared
    config file. If storium's type admits a function there, TypeScript blesses a config
    that drizzle-kit then rejects at runtime, and the user finds out at their next
    migration. Keeping it `string` means a shared `drizzle.config.ts` carries a static
    `dbCredentials.password` for drizzle-kit and the function on the inline `password`
    key for `connect()`, which already wins by today's precedence. The cost is one
    asymmetry to document.
  - *lean:* keep `dbCredentials.password` a `string`; widen only the inline key. Step 1
    is written to that lean; flip its seam if this resolves the other way.
- <a id="q2"></a>**Q2 (fromdrizzle-pointer)**: should the mysql refusal message point at
  `fromDrizzle()` at all, given mysql2 has no per-connection hook either way?,
  *resolve by:* decide
  - *plain:* the honest answer on mysql is "resolve the token yourself and hand mysql2 a
    string; it will be static for the pool's lifetime". Naming `fromDrizzle()` suggests
    a workaround that does not exist for rotation. Dropping it keeps the message
    truthful; keeping it shows the escape hatch for everything else.
  - *lean:* keep the pointer but phrase it as "a pool you manage", not as a rotation
    fix (the wording in *Refusals* already does this).

## Verdicts

- (none yet; no fork needs a spike)

## Notes for the plan session

- **Stale sidecar.** `.plumbbob/` in this repo is a legacy flat layout from a June
  session ("Evaluate the value of the qa- skills", `STATE` = DESIGN, `check=npm test`).
  It is untracked and excluded via `.git/info/exclude`. plumbbob 0.11 keeps a legacy
  layout until `plumbbob doctor --migrate` runs, so migrate or clear it before
  `plumbbob start`, otherwise `status` keeps reporting that session.
- **Gate.** Set `"check": "pnpm lint && pnpm test:run"` in `.plumbbob/settings.json` (what the old
  sidecar used); the integration run in step 5 is on top of that, by hand, with Docker.
- **Branch.** Work on a feature branch off `main` (for example `password-function`)
  and land it as a PR, as `driverOptions` did (#3, #4). Release afterwards with
  `/version patch`.

## Source

The issue body, verbatim, for provenance (author `robmclarty-minga`, 2026-09-08).

> ## Summary
>
> `storium.connect()` has no way to express a **per-connection password function**, which is the mechanism `pg` provides for rotating credentials — RDS IAM database authentication (15-minute signed tokens), Cloud SQL IAM auth, Vault dynamic secrets. Today the only route is dropping `connect()` for `fromDrizzle()` with a hand-built pool, which is exactly what `driverOptions` (0.15.3) was meant to make unnecessary.
>
> Two things block it, and the second one means the fix has to live in storium rather than in the caller.
>
> ## 1. `driverOptions.password` is a `ConfigError`
>
> `URL_COMPONENT_KEYS` in `src/connect.ts` includes `'password'`, so:
>
> ```ts
> storium.connect({
>   dialect: 'postgresql',
>   url: 'postgres://app@db.example.internal:5432/app',
>   driverOptions: { password: async () => await signer.getAuthToken() },
> })
> // ConfigError: `driverOptions.password` is not allowed: the connection URL and
> // its parts come from `url` / `dbCredentials`, not `driverOptions`.
> ```
>
> That rejection is deliberate and the reasoning in the docblock is right (pg and mysql2 resolve URL-vs-component collisions in opposite directions). But the typed alternative — `password?: string` on `StoriumConfig` / `dbCredentials` — is string-only, and `buildConnectionUrl` folds it into a URL string, so a function has nowhere to go.
>
> ## 2. Even if it were allowed, `pg` would clobber it
>
> This is the part that makes it storium's to fix. `connect()` always hands pg `connectionString: url` (`src/connect.ts`, the `new Pool({ ...config.driverOptions, connectionString: url, ... })` call). `pg`'s `ConnectionParameters` then does:
>
> ```js
> // pg/lib/connection-parameters.js
> if (config.connectionString) {
>   config = Object.assign({}, config, parse(config.connectionString))
> }
> ```
>
> The parsed connection string is spread **over** the explicit config — the DSN is the last writer on every key `pg-connection-string` emits. And a DSN with **no** password still parses to `password: ""` (key present), so it clobbers a function too.
>
> Measured, pg 8.22.0 / pg-connection-string 2.14.0 / Node 24:
>
> | Pool config | `connectionParameters.password` |
> | -- | -- |
> | `{ connectionString: 'postgres://u@h/db', password: fn }` | `null` — function lost |
> | `{ connectionString: 'postgres://u:secret@h/db', password: fn }` | `"secret"` — function lost |
> | `{ host, port, user, database, password: fn }` (no connectionString) | `fn` — survives |
>
> `pg` resolves the function per new connection in `Client._getPassword` (`pg/lib/client.js`, the `typeof this.password === 'function'` branch), which is what makes it correct for short-lived tokens: every connection the pool opens mints a fresh one. A token baked into the URL string would work for the first connection and fail for every pool connection opened after it expires.
>
> This is the same mechanism as the `ssl` behaviour that motivated `driverOptions`: any key the DSN can carry wins over the same key given explicitly. `ssl` was worked around by having callers strip the query params from their DSN. `password` can't be worked around that way, because a passwordless DSN still emits the key.
>
> ## Proposed change
>
> 1. **Widen the type.** `password?: string | (() => string | Promise<string>)` on both the inline shape and `dbCredentials`. (`pg` also passes `ConnectionParameters` as the function's argument; whether to expose that is your call.)
>
> 2. **When `password` is a function on the `postgresql` dialect, build the pool from components, not a URL.** Storium already has all of them: `buildConnectionUrl` reads `host`/`port`/`database`/`user` today, and a `url`-shaped config can be parsed into the same set. Something like:
>
>    ```ts
>    const pool = typeof password === 'function'
>      ? new Pool({ ...config.driverOptions, host, port, user, database, password, ...poolMinMax })
>      : new Pool({ ...config.driverOptions, connectionString: url, ...poolMinMax })
>    ```
>
>    Because `connectionString` is absent on that branch, pg never runs the `Object.assign` and the function survives (third row of the table). The URL-key rejection in `assertDriverOptionsDoNotSetUrl` stays exactly as it is — storium still owns the target.
>
> 3. **Scope.** pg is the driver with a first-class password callback. mysql2's `PoolOptions.password` is string-only, so I'd suggest a `ConfigError` for a function password on `mysql`/`sqlite` rather than silently stringifying it.
>
> 4. **Docs.** One sentence in the `driverOptions` docblock would have saved me the measurement: "pg merges the parsed `connectionString` over these options, so any key a DSN can carry (`ssl`, `password`, `host`, …) is won by the DSN — storium rejects the URL components for that reason; strip `ssl*` query params from your DSN if you set `ssl` here."
>
> ## Why not just use `fromDrizzle()`?
>
> It works, and it's the fallback if this doesn't land. But it gives up `connect()`'s pool lifecycle, `pool.min/max` mapping and config normalization for one option — and the 0.15.3 changelog names avoiding that as the reason `driverOptions` exists.
>
> ## Environment
>
> - storium 0.15.3 (also checked `main`: `URL_COMPONENT_KEYS` and the `connectionString: url` call are unchanged)
> - pg 8.22.0, pg-connection-string 2.14.0, drizzle-orm 0.45.2
> - Node 24.9.0
