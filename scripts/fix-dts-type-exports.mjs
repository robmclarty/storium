// Re-apply the `type` modifier to type-only exports in the bundled declarations.
//
// tsup bundles declarations with rollup-plugin-dts, which drops the `type`
// modifier when it re-exports symbols from a shared chunk: a source
// `export type { Foo } from './types'` is emitted into dist as a plain
// `export { Foo }`, declaring a type-only export as a runtime *value* export.
// A consumer with `verbatimModuleSyntax` writing `import { Foo } from 'storium'`
// then compiles clean but crashes at runtime ("does not provide an export named
// 'Foo'"). checkride's `smoke` check catches exactly this.
//
// This runs after tsup in the `build` script — chained rather than via tsup's
// `onSuccess`, which fires before the separate dts pass finishes and would be
// clobbered. It marks each affected specifier `type`, using each entry barrel's
// own `export type { … }` lists as the source of truth. Idempotent: a specifier
// already carrying `type` is left alone, so re-running is a no-op.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/** Public names a barrel exports type-only (`export type { … }`), resolving aliases to the exported name. */
function typeOnlyNames(barrelPath) {
  // Strip comments first: the barrel groups the `export type { … }` list with
  // `// section` comments, which would otherwise fuse onto the following name.
  const src = readFileSync(barrelPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  const names = new Set()
  for (const block of src.matchAll(/export\s+type\s*\{([\s\S]*?)\}/g)) {
    for (const spec of block[1].split(',')) {
      const name = spec
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

/** Prepend `type` to every `export { … }` specifier in `dtsPath` whose exported name is type-only. */
function qualifyTypeExports(dtsPath, names) {
  if (!existsSync(dtsPath)) return 0
  const before = readFileSync(dtsPath, 'utf8')
  let changed = 0
  // `export { … }` blocks only (with or without a trailing `from '…'`); the
  // non-greedy body stops at the first `}` — export specifier lists never nest.
  const after = before.replace(/(^export\s*\{)([\s\S]*?)(\})/gm, (_full, open, body, close) => {
    const specs = body.split(',').map((raw) => {
      const spec = raw.trim()
      if (spec === '' || /^type\b/.test(spec)) return raw // empty or already type-only
      const exported = /\bas\s+([A-Za-z_$][\w$]*)\s*$/.exec(spec)?.[1] ?? spec
      if (!names.has(exported)) return raw
      changed++
      const lead = raw.match(/^\s*/)[0]
      return `${lead}type ${spec}`
    })
    return `${open}${specs.join(',')}${close}`
  })
  if (after !== before) writeFileSync(dtsPath, after)
  return changed
}

// Each entry barrel and the declaration files tsup emits for it (ESM + CJS).
const entries = [
  { barrel: 'src/index.ts', dts: ['dist/index.d.ts', 'dist/index.d.cts'] },
  { barrel: 'src/migrate/index.ts', dts: ['dist/migrate.d.ts', 'dist/migrate.d.cts'] },
]

let total = 0
for (const { barrel, dts } of entries) {
  const names = typeOnlyNames(barrel)
  for (const file of dts) total += qualifyTypeExports(file, names)
}
console.log(`fix-dts-type-exports: re-qualified ${total} type-only export specifier(s)`)
