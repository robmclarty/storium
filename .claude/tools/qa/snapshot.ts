import type {
  FileEntry,
  Snapshot,
  SnapshotSummary,
  SnapshotDiff,
  QAConfig,
  TestRegistry,
} from './types.js'
import {
  exec,
  execJSON,
  readJSON,
  writeJSON,
  fileExists,
  qastatePath,
  ensureDir,
  fileTimestamp,
  inferDomain,
  classifyFile,
} from './utils.js'

// --- Types for raw tool outputs ---

type FallowFileScore = {
  path: string
  fan_in: number
  fan_out: number
  dead_code_ratio: number
  complexity_density: number
  maintainability_index: number
  total_cyclomatic: number
  total_cognitive: number
  function_count: number
  lines: number
  crap_max: number
  crap_above_threshold: number
}

type FallowHotspot = {
  path: string
  score: number
  commits: number
  weighted_commits: number
  lines_added: number
  lines_deleted: number
  complexity_density: number
  fan_in: number
  trend: 'heating' | 'cooling' | 'stable'
}

type FallowHealthOutput = {
  file_scores?: FallowFileScore[]
  hotspots?: FallowHotspot[]
  vital_signs?: { circular_dep_count?: number }
  health_score?: { score: number; grade: string }
}

type FallowDeadCodeOutput = {
  unused_files: { path: string }[]
  unused_exports: { path: string; name: string }[]
  circular_dependencies: { files: string[] }[]
  summary: { circular_dependencies: number }
}

type FallowDupesOutput = {
  clone_groups: { instances: { path: string; lines: number }[] }[]
  stats: { duplication_percentage: number; duplicated_lines: number }
}

type AstGrepMatch = {
  path: string
  rule: string
  line: number
  message: string
}

type ToolOutputs = {
  fallowHealth: FallowHealthOutput
  fallowDeadCode: FallowDeadCodeOutput
  fallowDupes: FallowDupesOutput
  depcruise: any | null
  astgrep: AstGrepMatch[] | null
  tscErrors: Record<string, number>
  gitStats: Record<string, { commits: number; authors: number; lastModified: string }>
  knip: any | null
  coverage: Record<string, { lines: number; branches: number }> | null
}

// --- Core functions ---

export function mergeToolOutputs(outputs: ToolOutputs): Record<string, FileEntry> {
  const files: Record<string, FileEntry> = {}

  const config = fileExists(qastatePath('config.json'))
    ? readJSON<QAConfig>(qastatePath('config.json'))
    : null
  const domainWeights = config?.domainWeights ?? {}

  // Seed from fallow file_scores
  for (const fs of outputs.fallowHealth.file_scores ?? []) {
    files[fs.path] = {
      path: fs.path,
      classification: classifyFile(fs.path),
      domain: inferDomain(fs.path, domainWeights),
      maintainability: fs.maintainability_index,
      complexityDensity: fs.complexity_density,
      totalCyclomatic: fs.total_cyclomatic,
      totalCognitive: fs.total_cognitive,
      functionCount: fs.function_count,
      lines: fs.lines,
      crapMax: fs.crap_max,
      fanIn: fs.fan_in,
      fanOut: fs.fan_out,
      deadCodeRatio: fs.dead_code_ratio,
      isHotspot: false,
      hotspotScore: null,
      hotspotTrend: null,
      hasDeadExports: false,
      deadExportCount: 0,
      hasDuplicates: false,
      duplicateLineCount: 0,
      circularWith: [],
      dependencyDepth: 0,
      patternViolations: [],
      tscErrorCount: 0,
      lineCoverage: null,
      branchCoverage: null,
      commits6mo: 0,
      authors6mo: 0,
      lastModified: '',
      coveredByTests: [],
    }
  }

  // Overlay hotspots
  for (const hs of outputs.fallowHealth.hotspots ?? []) {
    const entry = files[hs.path]
    if (entry) {
      entry.isHotspot = true
      entry.hotspotScore = hs.score
      entry.hotspotTrend = hs.trend
    }
  }

  // Overlay dead exports
  const deadExportsByFile = new Map<string, number>()
  for (const ue of outputs.fallowDeadCode.unused_exports ?? []) {
    deadExportsByFile.set(ue.path, (deadExportsByFile.get(ue.path) ?? 0) + 1)
  }
  for (const [path, count] of deadExportsByFile) {
    const entry = files[path]
    if (entry) {
      entry.hasDeadExports = true
      entry.deadExportCount = count
    }
  }

  // Overlay circular deps
  for (const circ of outputs.fallowDeadCode.circular_dependencies ?? []) {
    for (const file of circ.files ?? []) {
      const entry = files[file]
      if (entry) {
        const others = circ.files.filter((f: string) => f !== file)
        entry.circularWith = [...new Set([...entry.circularWith, ...others])]
      }
    }
  }

  // Overlay duplicates
  for (const group of outputs.fallowDupes.clone_groups ?? []) {
    for (const inst of group.instances ?? []) {
      const entry = files[inst.path]
      if (entry) {
        entry.hasDuplicates = true
        entry.duplicateLineCount += inst.lines ?? 0
      }
    }
  }

  // Overlay ast-grep violations
  if (outputs.astgrep) {
    for (const match of outputs.astgrep) {
      const entry = files[match.path]
      if (entry) {
        entry.patternViolations.push({
          rule: match.rule,
          line: match.line,
          message: match.message,
        })
      }
    }
  }

  // Overlay tsc errors
  for (const [path, count] of Object.entries(outputs.tscErrors)) {
    const entry = files[path]
    if (entry) {
      entry.tscErrorCount = count
    }
  }

  // Overlay git stats
  for (const [path, stats] of Object.entries(outputs.gitStats)) {
    const entry = files[path]
    if (entry) {
      entry.commits6mo = stats.commits
      entry.authors6mo = stats.authors
      entry.lastModified = stats.lastModified
    }
  }

  // Overlay coverage
  if (outputs.coverage) {
    for (const [path, cov] of Object.entries(outputs.coverage)) {
      const entry = files[path]
      if (entry) {
        entry.lineCoverage = cov.lines
        entry.branchCoverage = cov.branches
      }
    }
  }

  // Overlay test registry
  if (fileExists(qastatePath('test-registry.json'))) {
    const registry = readJSON<TestRegistry>(qastatePath('test-registry.json'))
    for (const test of registry.entries) {
      for (const coveredFile of test.coveredFiles) {
        const entry = files[coveredFile]
        if (entry && !entry.coveredByTests.includes(test.id)) {
          entry.coveredByTests.push(test.id)
        }
      }
    }
  }

  return files
}

export function diffSnapshots(
  prevFiles: Record<string, FileEntry> | null,
  currFiles: Record<string, FileEntry>,
): SnapshotDiff | null {
  if (!prevFiles) return null

  const prevPaths = new Set(Object.keys(prevFiles))
  const currPaths = new Set(Object.keys(currFiles))

  const added = [...currPaths].filter(p => !prevPaths.has(p))
  const removed = [...prevPaths].filter(p => !currPaths.has(p))

  const improved: string[] = []
  const regressed: string[] = []

  for (const path of currPaths) {
    if (!prevPaths.has(path)) continue
    const prev = prevFiles[path]
    const curr = currFiles[path]
    if (prev.maintainability != null && curr.maintainability != null) {
      if (curr.maintainability > prev.maintainability + 1) improved.push(path)
      else if (curr.maintainability < prev.maintainability - 1) regressed.push(path)
    }
  }

  const parts: string[] = []
  if (added.length) parts.push(`${added.length} added`)
  if (removed.length) parts.push(`${removed.length} removed`)
  if (improved.length) parts.push(`${improved.length} improved`)
  if (regressed.length) parts.push(`${regressed.length} regressed`)
  const summary = parts.length ? parts.join(', ') : 'No changes'

  return { improved, regressed, added, removed, summary }
}

export function buildSummary(
  files: Record<string, FileEntry>,
  healthScore: { score: number; grade: string } | null,
  dupesStats: { duplication_percentage: number } | null,
  testsTracked: number,
): SnapshotSummary {
  const entries = Object.values(files)
  const sourceFiles = entries.filter(e => e.classification === 'source')
  const scored = sourceFiles.filter(e => e.maintainability != null)
  const avgMaint = scored.length
    ? scored.reduce((sum, e) => sum + (e.maintainability ?? 0), 0) / scored.length
    : null
  const withCoverage = sourceFiles.filter(e => e.lineCoverage != null)
  const totalCoverage = withCoverage.length
    ? withCoverage.reduce((sum, e) => sum + (e.lineCoverage ?? 0), 0) / withCoverage.length
    : null

  return {
    healthScore: healthScore?.score ?? null,
    healthGrade: healthScore?.grade ?? null,
    totalFiles: entries.length,
    filesScored: scored.length,
    avgMaintainability: avgMaint ? Math.round(avgMaint * 10) / 10 : null,
    totalCoverage: totalCoverage ? Math.round(totalCoverage * 10) / 10 : null,
    deadCodeFiles: entries.filter(e => e.hasDeadExports).length,
    deadCodeExports: entries.reduce((sum, e) => sum + e.deadExportCount, 0),
    duplicationPercent: dupesStats?.duplication_percentage ?? 0,
    circularDeps: entries.filter(e => e.circularWith.length > 0).length,
    tscErrors: entries.reduce((sum, e) => sum + e.tscErrorCount, 0),
    hotspotCount: entries.filter(e => e.isHotspot).length,
    patternViolationCount: entries.reduce((sum, e) => sum + e.patternViolations.length, 0),
    testsTracked,
  }
}

// --- Tool runners (private) ---

function runFallowHealth(): FallowHealthOutput {
  return execJSON<FallowHealthOutput>(
    'fallow health --file-scores --hotspots --format json --quiet'
  ) ?? { file_scores: [], hotspots: [] }
}

function runFallowScore(): { score: number; grade: string } | null {
  const result = execJSON<any>('fallow --format json --quiet --score')
  return result?.health_score ?? null
}

function runFallowDeadCode(): FallowDeadCodeOutput {
  return execJSON<FallowDeadCodeOutput>(
    'fallow dead-code --format json --quiet'
  ) ?? { unused_files: [], unused_exports: [], circular_dependencies: [], summary: { circular_dependencies: 0 } }
}

function runFallowDupes(): FallowDupesOutput {
  return execJSON<FallowDupesOutput>(
    'fallow dupes --format json --quiet'
  ) ?? { clone_groups: [], stats: { duplication_percentage: 0, duplicated_lines: 0 } }
}

function runDepcruise(): any | null {
  return execJSON<any>('npx depcruise --output-type json --no-config --ts-pre-compilation-deps src/')
}

function runAstGrep(): AstGrepMatch[] | null {
  const raw = execJSON<any[]>('npx sg scan --json')
  if (!raw || !Array.isArray(raw)) return null
  return raw.map(m => ({
    path: m.file ?? m.path ?? '',
    rule: m.ruleId ?? m.rule ?? '',
    line: m.range?.start?.line ?? m.line ?? 0,
    message: m.message ?? '',
  }))
}

function runTscErrors(): Record<string, number> {
  const result = exec('npx tsc --noEmit 2>&1')
  const errors: Record<string, number> = {}
  for (const line of result.stdout.split('\n')) {
    const match = line.match(/^(.+?)\(\d+,\d+\): error TS\d+:/)
    if (match) {
      const path = match[1]
      errors[path] = (errors[path] ?? 0) + 1
    }
  }
  return errors
}

function runGitStats(): Record<string, { commits: number; authors: number; lastModified: string }> {
  const stats: Record<string, { commits: number; authors: number; lastModified: string }> = {}

  const result = exec(
    'git log --since="6 months ago" --format="%H %aI %aN" --name-only --diff-filter=AMCR'
  )
  const lines = result.stdout.split('\n')

  let currentDate = ''
  let currentAuthor = ''
  const authorsByFile = new Map<string, Set<string>>()

  for (const line of lines) {
    const headerMatch = line.match(/^[0-9a-f]{40} (\S+) (.+)$/)
    if (headerMatch) {
      currentDate = headerMatch[1].split('T')[0]
      currentAuthor = headerMatch[2]
      continue
    }
    if (line.trim() === '') continue

    const path = line.trim()
    if (!stats[path]) {
      stats[path] = { commits: 0, authors: 0, lastModified: currentDate }
      authorsByFile.set(path, new Set())
    }
    stats[path].commits++
    if (currentDate > stats[path].lastModified) {
      stats[path].lastModified = currentDate
    }
    authorsByFile.get(path)!.add(currentAuthor)
  }

  for (const [path, authors] of authorsByFile) {
    stats[path].authors = authors.size
  }

  return stats
}

function runKnip(): any | null {
  return execJSON<any>('npx knip --reporter json')
}

function runCoverage(): Record<string, { lines: number; branches: number }> | null {
  const result = exec('npx vitest run --coverage --reporter=json', { timeout: 300_000 })
  if (result.exitCode !== 0) return null
  const coveragePath = `${process.cwd()}/coverage/coverage-final.json`
  if (!fileExists(coveragePath)) return null

  const raw = readJSON<Record<string, any>>(coveragePath)
  const parsed: Record<string, { lines: number; branches: number }> = {}

  for (const [absPath, data] of Object.entries(raw)) {
    const relPath = absPath.replace(process.cwd() + '/', '')
    const stmts = data.s ?? {}
    const branches = data.b ?? {}

    const stmtTotal = Object.keys(stmts).length
    const stmtCovered = Object.values(stmts).filter((v: any) => v > 0).length
    const branchTotal = Object.values(branches).flat().length
    const branchCovered = (Object.values(branches).flat() as number[]).filter(v => v > 0).length

    parsed[relPath] = {
      lines: stmtTotal ? Math.round((stmtCovered / stmtTotal) * 100) : 0,
      branches: branchTotal ? Math.round((branchCovered / branchTotal) * 100) : 0,
    }
  }

  return parsed
}

// --- Main pipeline ---

export async function runSnapshot(opts: { coverage?: boolean; force?: boolean } = {}): Promise<Snapshot> {
  console.log('Running QA snapshot pipeline...')

  console.log('  Collecting fallow health...')
  const fallowHealth = runFallowHealth()

  console.log('  Collecting fallow score...')
  const healthScore = runFallowScore()
  if (healthScore && fallowHealth) {
    (fallowHealth as any).health_score = healthScore
  }

  console.log('  Collecting fallow dead-code...')
  const fallowDeadCode = runFallowDeadCode()

  console.log('  Collecting fallow dupes...')
  const fallowDupes = runFallowDupes()

  console.log('  Running dependency-cruiser...')
  const depcruise = runDepcruise()

  console.log('  Running ast-grep...')
  const astgrep = runAstGrep()

  console.log('  Checking tsc errors...')
  const tscErrors = runTscErrors()

  console.log('  Collecting git stats...')
  const gitStats = runGitStats()

  console.log('  Running knip...')
  const knip = runKnip()

  let coverage: Record<string, { lines: number; branches: number }> | null = null
  if (opts.coverage) {
    console.log('  Running vitest coverage (this may take a while)...')
    coverage = runCoverage()
  }

  console.log('  Merging tool outputs...')
  const files = mergeToolOutputs({
    fallowHealth,
    fallowDeadCode,
    fallowDupes,
    depcruise,
    astgrep,
    tscErrors,
    gitStats,
    knip,
    coverage,
  })

  const latestPath = qastatePath('snapshots', 'latest.json')
  const prevSnapshot = fileExists(latestPath) ? readJSON<Snapshot>(latestPath) : null
  const diff = diffSnapshots(prevSnapshot?.files ?? null, files)

  const registryPath = qastatePath('test-registry.json')
  const registry = fileExists(registryPath) ? readJSON<TestRegistry>(registryPath) : null
  const testsTracked = registry?.entries.filter(e => e.status === 'active').length ?? 0

  const summary = buildSummary(
    files,
    (fallowHealth as any).health_score ?? healthScore,
    fallowDupes.stats,
    testsTracked,
  )

  const snapshot: Snapshot = {
    timestamp: new Date().toISOString(),
    command: 'qa-snapshot',
    summary,
    files,
    diff,
  }

  ensureDir(qastatePath('snapshots', 'history'))
  writeJSON(latestPath, snapshot)
  writeJSON(qastatePath('snapshots', 'history', `${fileTimestamp()}.json`), snapshot)

  console.log('  Snapshot saved.')
  return snapshot
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('snapshot.ts')) {
  const args = process.argv.slice(2)
  const withCoverage = args.includes('--coverage')
  const force = args.includes('--force')
  runSnapshot({ coverage: withCoverage, force }).catch(err => {
    console.error('Snapshot failed:', err)
    process.exit(1)
  })
}
