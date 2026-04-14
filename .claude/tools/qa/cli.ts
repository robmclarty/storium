import { readdirSync } from 'node:fs'
import { verifyRegistry } from './registry.js'
import { diffSnapshots } from './snapshot.js'
import { readJSON, writeJSON, healthPath, fileExists, isoDate } from './utils.js'
import type { TestRegistry, Snapshot } from './types.js'

// ------------------------------------------------------------------ Helpers --

type ParsedFlags = { positional: string[]; flags: Record<string, string | true> }

function parseFlags(args: string[]): ParsedFlags {
  const positional: string[] = []
  const flags: Record<string, string | true> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2)
      const next = args[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(args[i])
    }
  }
  return { positional, flags }
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] ?? '').length)),
  )
  const pad = (row: string[]) => row.map((c, i) => (c ?? '').padEnd(widths[i])).join('  ')
  const sep = widths.map(w => '-'.repeat(w)).join('  ')
  return [pad(headers), sep, ...rows.map(pad)].join('\n')
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function die(msg: string): never {
  console.error(msg)
  process.exit(1)
}

function outputResult(data: unknown, flags: ParsedFlags, formatted: string): void {
  if (flags.flags.json) {
    console.log(JSON.stringify(data, null, 2))
  } else {
    console.log(formatted)
  }
}

// ------------------------------------------------------------ Data loaders --

function loadRegistry(): TestRegistry {
  const path = healthPath('test-registry.json')
  if (!fileExists(path)) die('No test registry found. Run /qa-snapshot first.')
  return readJSON<TestRegistry>(path)
}

function loadSnapshot(target: string = 'latest'): Snapshot {
  let path: string
  if (target === 'latest') {
    path = healthPath('snapshots', 'latest.json')
  } else {
    path = healthPath('snapshots', 'history', `${target}.json`)
  }
  if (!fileExists(path)) die(`Snapshot not found: ${path}`)
  return readJSON<Snapshot>(path)
}

function listHistory(): string[] {
  const dir = healthPath('snapshots', 'history')
  if (!fileExists(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .toSorted()
    .map(f => f.replace('.json', ''))
}

type LearningEntry = {
  id: string
  insight: string
  category: string
  confidence: string
  firstSeen: string
  lastConfirmed: string
  context: string
}

function loadLearnings(): LearningEntry[] {
  const path = healthPath('learnings.json')
  if (!fileExists(path)) return []
  const data = readJSON<{ entries: LearningEntry[] }>(path)
  return data.entries
}

function saveLearnings(entries: LearningEntry[]): void {
  writeJSON(healthPath('learnings.json'), { version: 1, entries })
}

function nextLearningId(entries: LearningEntry[]): string {
  let max = 0
  for (const e of entries) {
    const m = e.id.match(/^L(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return `L${String(max + 1).padStart(3, '0')}`
}

function findLearning(entries: LearningEntry[], id: string): LearningEntry | undefined {
  return entries.find(e => e.id.toLowerCase() === id.toLowerCase())
}

function printLearning(entry: LearningEntry): void {
  console.log(`ID:             ${entry.id}`)
  console.log(`Category:       ${entry.category}`)
  console.log(`Confidence:     ${entry.confidence}`)
  console.log(`Insight:        ${entry.insight}`)
  console.log(`First Seen:     ${entry.firstSeen}`)
  console.log(`Last Confirmed: ${entry.lastConfirmed}`)
  if (entry.context) console.log(`Context:        ${entry.context}`)
  if ((entry as any).supersedes) console.log(`Supersedes:     ${(entry as any).supersedes}`)
  if ((entry as any).mergedFrom) console.log(`Merged From:    ${(entry as any).mergedFrom.join(', ')}`)
}

// -------------------------------------------------------------- Subcommands --

function cmdVerify(flags: ParsedFlags): void {
  const path = healthPath('test-registry.json')
  if (!fileExists(path)) die('No test registry found. Run /qa-snapshot first.')
  const report = verifyRegistry(path)

  const data = report
  const lines = [
    `Total: ${report.total}`,
    `Active: ${report.active.length}`,
    `Missing: ${report.missing.length}`,
    `Stale: ${report.stale.length}`,
  ]
  if (report.missing.length > 0) lines.push(`\nMissing IDs: ${report.missing.join(', ')}`)
  if (report.stale.length > 0) lines.push(`Stale IDs: ${report.stale.join(', ')}`)

  outputResult(data, flags, lines.join('\n'))
  if (report.missing.length > 0 || report.stale.length > 0) process.exit(1)
}

function cmdTestsList(flags: ParsedFlags): void {
  const reg = loadRegistry()
  let entries = reg.entries

  const statusFilter = flags.flags.status
  if (typeof statusFilter === 'string') {
    entries = entries.filter(e => e.status === statusFilter)
  }
  const typeFilter = flags.flags.type
  if (typeof typeFilter === 'string') {
    entries = entries.filter(e => e.type === typeFilter)
  }

  const rows = entries.map(e => [
    e.id,
    truncate(e.name, 40),
    truncate(e.suite, 20),
    truncate(e.file, 45),
    e.type,
    e.status,
  ])

  const formatted = formatTable(
    ['ID', 'Name', 'Suite', 'File', 'Type', 'Status'],
    rows,
  ) + `\n\n${entries.length} tests`

  outputResult(entries, flags, formatted)
}

function cmdTestsCoverageGaps(flags: ParsedFlags): void {
  const snapshot = loadSnapshot()
  const reg = loadRegistry()

  const coveredSet = new Set<string>()
  for (const entry of reg.entries) {
    for (const f of entry.coveredFiles ?? []) {
      coveredSet.add(f)
    }
  }

  let sourceFiles = Object.values(snapshot.files).filter(
    f => f.classification === 'source',
  )

  const domainFilter = flags.flags.domain
  if (typeof domainFilter === 'string') {
    sourceFiles = sourceFiles.filter(f => f.domain === domainFilter)
  }

  const uncovered = sourceFiles.filter(f => !coveredSet.has(f.path))
  uncovered.sort((a, b) => (a.maintainability ?? 100) - (b.maintainability ?? 100))

  const rows = uncovered.map(f => [
    f.path,
    f.domain ?? '-',
    String(f.maintainability ?? '-'),
    String(f.lines ?? '-'),
    String(f.totalCyclomatic ?? '-'),
  ])

  const formatted = formatTable(
    ['File', 'Domain', 'Maintainability', 'Lines', 'Cyclomatic'],
    rows,
  ) + `\n\n${uncovered.length} uncovered source files`

  outputResult(uncovered, flags, formatted)
}

function cmdSnapshotShow(flags: ParsedFlags): void {
  const target = flags.positional[0] ?? 'latest'
  const snapshot = loadSnapshot(target)
  const s = snapshot.summary

  const lines = [
    `Timestamp:           ${snapshot.timestamp}`,
    `Health:              ${s.healthScore}/100 (${s.healthGrade})`,
    `Files:               ${s.filesScored}/${s.totalFiles} scored`,
    `Avg Maintainability: ${s.avgMaintainability}`,
    `Coverage:            ${s.totalCoverage !== null ? s.totalCoverage + '%' : 'N/A'}`,
    `Hotspots:            ${s.hotspotCount}`,
    `Dead Code Files:     ${s.deadCodeFiles}`,
    `Dead Code Exports:   ${s.deadCodeExports}`,
    `Duplication:         ${s.duplicationPercent}%`,
    `Circular Deps:       ${s.circularDeps}`,
    `TSC Errors:          ${s.tscErrors}`,
    `Pattern Violations:  ${s.patternViolationCount}`,
    `Tests Tracked:       ${s.testsTracked}`,
  ]

  if (snapshot.diff) {
    lines.push(`\nDiff: ${snapshot.diff.summary}`)
  }

  outputResult(snapshot.summary, flags, lines.join('\n'))
}

function cmdSnapshotDiff(flags: ParsedFlags): void {
  const history = listHistory()
  let prevTs: string
  let currTs: string

  if (flags.positional.length >= 2) {
    prevTs = flags.positional[0]
    currTs = flags.positional[1]
  } else if (history.length >= 2) {
    prevTs = history[history.length - 2]
    currTs = history[history.length - 1]
  } else {
    die('Need at least 2 snapshots to diff. Provide timestamps or run more snapshots.')
  }

  const prev = loadSnapshot(prevTs)
  const curr = loadSnapshot(currTs)
  const diff = diffSnapshots(prev.files, curr.files)

  if (!diff) {
    die('Could not compute diff (no previous files).')
  }

  const lines = [
    `Comparing: ${prevTs}  →  ${currTs}`,
    `Summary: ${diff.summary}`,
  ]

  if (diff.improved.length > 0) {
    lines.push(`\nImproved (${diff.improved.length}):`)
    diff.improved.forEach(f => lines.push(`  + ${f}`))
  }
  if (diff.regressed.length > 0) {
    lines.push(`\nRegressed (${diff.regressed.length}):`)
    diff.regressed.forEach(f => lines.push(`  - ${f}`))
  }
  if (diff.added.length > 0) {
    lines.push(`\nAdded (${diff.added.length}):`)
    diff.added.forEach(f => lines.push(`  + ${f}`))
  }
  if (diff.removed.length > 0) {
    lines.push(`\nRemoved (${diff.removed.length}):`)
    diff.removed.forEach(f => lines.push(`  - ${f}`))
  }

  outputResult(diff, flags, lines.join('\n'))
}

function cmdLearningsList(flags: ParsedFlags): void {
  let entries = loadLearnings()

  const catFilter = flags.flags.category
  if (typeof catFilter === 'string') {
    entries = entries.filter(e => e.category === catFilter)
  }
  const confFilter = flags.flags.confidence
  if (typeof confFilter === 'string') {
    entries = entries.filter(e => e.confidence === confFilter)
  }

  const rows = entries.map(e => [
    e.id,
    e.category,
    e.confidence,
    truncate(e.insight, 60),
    e.firstSeen,
  ])

  const formatted = formatTable(
    ['ID', 'Category', 'Confidence', 'Insight', 'First Seen'],
    rows,
  ) + `\n\n${entries.length} learnings`

  outputResult(entries, flags, formatted)
}

function cmdLearningsAdd(flags: ParsedFlags): void {
  const category = flags.flags.category
  const insight = flags.flags.insight
  if (typeof category !== 'string') die('--category is required')
  if (typeof insight !== 'string') die('--insight is required')

  const entries = loadLearnings()
  const id = nextLearningId(entries)
  const today = isoDate()
  const confidence = typeof flags.flags.confidence === 'string' ? flags.flags.confidence : 'low'
  const context = typeof flags.flags.context === 'string' ? flags.flags.context : ''

  const entry: LearningEntry = {
    id, category, insight, confidence, firstSeen: today, lastConfirmed: today, context,
  }

  entries.push(entry)
  saveLearnings(entries)
  console.log(`Added ${id}:`)
  printLearning(entry)
}

function cmdLearningsConfirm(flags: ParsedFlags): void {
  const id = flags.positional[0]
  if (!id) die('Usage: learnings confirm <ID>')

  const entries = loadLearnings()
  const entry = findLearning(entries, id)
  if (!entry) die(`Learning ${id} not found.`)

  entry.lastConfirmed = isoDate()
  if (typeof flags.flags.confidence === 'string') entry.confidence = flags.flags.confidence
  if (typeof flags.flags.context === 'string') {
    entry.context = entry.context ? entry.context + '\n' + flags.flags.context : flags.flags.context
  }

  saveLearnings(entries)
  console.log(`Confirmed ${entry.id}:`)
  printLearning(entry)
}

function cmdLearningsUpdate(flags: ParsedFlags): void {
  const id = flags.positional[0]
  if (!id) die('Usage: learnings update <ID> [--insight ...] [--category ...] [--confidence ...] [--context ...]')

  const entries = loadLearnings()
  const entry = findLearning(entries, id)
  if (!entry) die(`Learning ${id} not found.`)

  let changed = false
  if (typeof flags.flags.insight === 'string') { entry.insight = flags.flags.insight; changed = true }
  if (typeof flags.flags.category === 'string') { entry.category = flags.flags.category; changed = true }
  if (typeof flags.flags.confidence === 'string') { entry.confidence = flags.flags.confidence; changed = true }
  if (typeof flags.flags.context === 'string') { entry.context = flags.flags.context; changed = true }

  if (!changed) die('No fields specified to update.')

  entry.lastConfirmed = isoDate()
  saveLearnings(entries)
  console.log(`Updated ${entry.id}:`)
  printLearning(entry)
}

function cmdLearningsSupersede(flags: ParsedFlags): void {
  const oldId = flags.positional[0]
  if (!oldId) die('Usage: learnings supersede <ID> --insight ...')
  const insight = flags.flags.insight
  if (typeof insight !== 'string') die('--insight is required')

  const entries = loadLearnings()
  const old = findLearning(entries, oldId)
  if (!old) die(`Learning ${oldId} not found.`)

  const newId = nextLearningId(entries)
  const today = isoDate()
  const category = typeof flags.flags.category === 'string' ? flags.flags.category : old.category
  const confidence = typeof flags.flags.confidence === 'string' ? flags.flags.confidence : 'low'
  const context = typeof flags.flags.context === 'string' ? flags.flags.context : ''

  old.insight = `[superseded by ${newId}] ${old.insight}`

  const newEntry: any = {
    id: newId, category, insight, confidence,
    firstSeen: today, lastConfirmed: today, context, supersedes: old.id,
  }

  entries.push(newEntry)
  saveLearnings(entries)
  console.log(`Superseded ${old.id} with ${newId}:\n`)
  console.log('Old:')
  printLearning(old)
  console.log('\nNew:')
  printLearning(newEntry)
}

function cmdLearningsRemove(flags: ParsedFlags): void {
  const id = flags.positional[0]
  if (!id) die('Usage: learnings remove <ID>')

  const entries = loadLearnings()
  const idx = entries.findIndex(e => e.id.toLowerCase() === id.toLowerCase())
  if (idx === -1) die(`Learning ${id} not found.`)

  const removed = entries.splice(idx, 1)[0]
  saveLearnings(entries)
  console.log(`Removed ${removed.id}: ${removed.insight}`)
}

function cmdLearningsMerge(flags: ParsedFlags): void {
  const ids = flags.positional
  if (ids.length < 2) die('Usage: learnings merge <ID1> <ID2> [<ID3>...] --insight ...')
  const insight = flags.flags.insight
  if (typeof insight !== 'string') die('--insight is required')

  const entries = loadLearnings()

  const sources: LearningEntry[] = []
  for (const id of ids) {
    const found = findLearning(entries, id)
    if (!found) die(`Learning ${id} not found.`)
    sources.push(found)
  }

  const confRank = { low: 0, medium: 1, high: 2 } as Record<string, number>
  const highestConf = sources.reduce((best, s) =>
    (confRank[s.confidence] ?? 0) > (confRank[best.confidence] ?? 0) ? s : best
  ).confidence
  const confidence = typeof flags.flags.confidence === 'string' ? flags.flags.confidence : highestConf

  const earliestSeen = sources.reduce((min, s) => s.firstSeen < min ? s.firstSeen : min, sources[0].firstSeen)
  const category = typeof flags.flags.category === 'string' ? flags.flags.category : sources[0].category
  const context = typeof flags.flags.context === 'string' ? flags.flags.context : ''

  const newId = nextLearningId(entries)

  const sourceIds = new Set(ids.map(id => id.toLowerCase()))
  const filtered = entries.filter(e => !sourceIds.has(e.id.toLowerCase()))

  const newEntry: any = {
    id: newId, category, insight, confidence,
    firstSeen: earliestSeen, lastConfirmed: isoDate(), context,
    mergedFrom: sources.map(s => s.id),
  }

  filtered.push(newEntry)
  saveLearnings(filtered)
  console.log(`Merged ${sources.map(s => s.id).join(', ')} into ${newId}:`)
  printLearning(newEntry)
}

function cmdTrace(flags: ParsedFlags): void {
  const target = flags.positional[0]
  if (!target) die('Usage: qa trace <QA-ID|file-path>')

  const reg = loadRegistry()
  const snapshotPath = healthPath('snapshots', 'latest.json')
  const hasSnapshot = fileExists(snapshotPath)
  const snapshot = hasSnapshot ? readJSON<Snapshot>(snapshotPath) : null

  if (/^QA-\d+$/.test(target)) {
    // ---- Trace by test ID ----
    const entry = reg.entries.find(e => e.id === target)
    if (!entry) die(`Test ${target} not found in registry.`)

    const lines = [
      `=== ${entry.id}: ${entry.name} ===`,
      `Suite:   ${entry.suite}`,
      `File:    ${entry.file}:${entry.line}`,
      `Type:    ${entry.type}`,
      `Status:  ${entry.status}`,
    ]

    const coveredFiles = entry.coveredFiles ?? []
    if (coveredFiles.length > 0) {
      lines.push(`\nCovered files (${coveredFiles.length}):`)
      for (const f of coveredFiles) {
        const fe = snapshot?.files?.[f]
        if (fe) {
          lines.push(`  ${f}  (maint: ${fe.maintainability}, cov: ${fe.lineCoverage ?? 'N/A'})`)
        } else {
          lines.push(`  ${f}  (not in snapshot)`)
        }
      }

      // Find sibling tests covering the same files
      const siblings = reg.entries.filter(
        e => e.id !== target && e.coveredFiles?.some(cf => coveredFiles.includes(cf)),
      )
      if (siblings.length > 0) {
        lines.push(`\nSibling tests (${siblings.length}):`)
        const sibRows = siblings.map(s => [s.id, truncate(s.name, 40), s.suite, `${s.file}:${s.line}`])
        lines.push(formatTable(['ID', 'Name', 'Suite', 'Location'], sibRows))
      }
    } else {
      lines.push('\nNo covered files recorded.')
    }

    const result = { test: entry, coveredFiles: coveredFiles.map(f => ({ path: f, metrics: snapshot?.files?.[f] ?? null })), siblings: reg.entries.filter(e => e.id !== target && e.coveredFiles?.some(cf => coveredFiles.includes(cf))) }
    outputResult(result, flags, lines.join('\n'))
  } else {
    // ---- Trace by file path ----
    const filePath = target
    const fe = snapshot?.files?.[filePath]

    const lines: string[] = []
    if (fe) {
      lines.push(
        `=== ${filePath} ===`,
        `Domain:          ${fe.domain ?? '-'}`,
        `Maintainability: ${fe.maintainability}`,
        `Cyclomatic:      ${fe.totalCyclomatic}`,
        `Lines:           ${fe.lines}`,
        `Coverage:        ${fe.lineCoverage !== null ? fe.lineCoverage + '%' : 'N/A'}`,
        `Hotspot:         ${fe.isHotspot ? `yes (score: ${fe.hotspotScore}, trend: ${fe.hotspotTrend})` : 'no'}`,
      )
    } else {
      lines.push(`=== ${filePath} ===`, 'Not found in latest snapshot.')
    }

    const coveringTests = reg.entries.filter(
      e => e.coveredFiles?.includes(filePath),
    )

    if (coveringTests.length > 0) {
      lines.push(`\nCovering tests (${coveringTests.length}):`)
      const testRows = coveringTests.map(t => [t.id, truncate(t.name, 40), t.suite, t.type, t.status])
      lines.push(formatTable(['ID', 'Name', 'Suite', 'Type', 'Status'], testRows))
    } else {
      lines.push('\nNo covering tests found in registry.')
    }

    const result = { file: fe ?? null, coveringTests }
    outputResult(result, flags, lines.join('\n'))
  }
}

// ------------------------------------------------------------------- Usage --

function printUsage(): void {
  console.log(`Usage: npx tsx .claude/tools/qa/cli.ts <command> [args] [flags]

Commands:
  trace <QA-ID|file>                         Trace test↔source dependencies
  tests list [--status S] [--type T]         List registered tests
  tests coverage-gaps [--domain D]           Find uncovered source files
  verify                                     Verify test registry integrity
  snapshot show [latest|<timestamp>]         Show snapshot summary
  snapshot diff [<ts1> <ts2>]                Compare two snapshots
  learnings list [--category C] [--confidence L]  List learnings
  learnings add --category <C> --insight <text> [--confidence L] [--context <text>]
  learnings confirm <ID> [--confidence L] [--context <text>]
  learnings update <ID> [--insight T] [--category C] [--confidence L] [--context T]
  learnings supersede <ID> --insight <text> [--category C] [--confidence L]
  learnings remove <ID>
  learnings merge <ID1> <ID2> [...] --insight <text> [--category C] [--confidence L]

Global flags:
  --json    Output as JSON
  --help    Show this help`)
}

// --------------------------------------------------------------- Dispatcher --

if (process.argv[1]?.endsWith('cli.ts')) {
  const allArgs = process.argv.slice(2)
  const subcmd = allArgs[0]
  const sub2 = allArgs[1]

  if (!subcmd || subcmd === '--help') {
    printUsage()
    process.exit(0)
  }

  // Parse flags from everything after the subcommand(s)
  const flagStart = subcmd === 'tests' || subcmd === 'snapshot' || subcmd === 'learnings' ? 2 : 1
  const flags = parseFlags(allArgs.slice(flagStart))

  switch (subcmd) {
    case 'trace':
      cmdTrace(flags)
      break
    case 'verify':
      cmdVerify(flags)
      break
    case 'tests':
      switch (sub2) {
        case 'list':
          cmdTestsList(flags)
          break
        case 'coverage-gaps':
          cmdTestsCoverageGaps(flags)
          break
        default:
          console.error(`Unknown tests subcommand: ${sub2 ?? '(none)'}`)
          printUsage()
          process.exit(1)
      }
      break
    case 'snapshot':
      switch (sub2) {
        case 'show':
          cmdSnapshotShow(flags)
          break
        case 'diff':
          cmdSnapshotDiff(flags)
          break
        default:
          console.error(`Unknown snapshot subcommand: ${sub2 ?? '(none)'}`)
          printUsage()
          process.exit(1)
      }
      break
    case 'learnings':
      switch (sub2) {
        case 'list':
          cmdLearningsList(flags)
          break
        case 'add':
          cmdLearningsAdd(flags)
          break
        case 'confirm':
          cmdLearningsConfirm(flags)
          break
        case 'update':
          cmdLearningsUpdate(flags)
          break
        case 'supersede':
          cmdLearningsSupersede(flags)
          break
        case 'remove':
          cmdLearningsRemove(flags)
          break
        case 'merge':
          cmdLearningsMerge(flags)
          break
        default:
          console.error(`Unknown learnings subcommand: ${sub2 ?? '(none)'}`)
          printUsage()
          process.exit(1)
      }
      break
    default:
      console.error(`Unknown command: ${subcmd}`)
      printUsage()
      process.exit(1)
  }
}
