import { writeFileSync, mkdirSync } from 'node:fs'
import type { Snapshot, FileEntry } from './types.js'

function pct(n: number | null): string {
  return n != null ? `${Math.round(n * 10) / 10}%` : 'N/A'
}

export function renderHealthReport(snapshot: Snapshot): string {
  const { summary, timestamp } = snapshot
  return `# Health Report

**Generated:** ${timestamp}
**Health Score:** ${summary.healthScore ?? 'N/A'}/100 (${summary.healthGrade ?? 'N/A'})

## Key Metrics

| Metric | Value |
|--------|-------|
| Total Files | ${summary.totalFiles} |
| Files Scored | ${summary.filesScored} |
| Avg Maintainability | ${summary.avgMaintainability ?? 'N/A'} |
| Line Coverage | ${pct(summary.totalCoverage)} |
| Dead Code Files | ${summary.deadCodeFiles} |
| Dead Code Exports | ${summary.deadCodeExports} |
| Duplication | ${pct(summary.duplicationPercent)} |
| Circular Dependencies | ${summary.circularDeps} |
| TSC Errors | ${summary.tscErrors} |
| Hotspots | ${summary.hotspotCount} |
| Pattern Violations | ${summary.patternViolationCount} |
| Tests Tracked | ${summary.testsTracked} |
`
}

export function renderHotspotsReport(snapshot: Snapshot): string {
  const hotspots = Object.values(snapshot.files)
    .filter(f => f.isHotspot)
    .sort((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))

  if (hotspots.length === 0) {
    return `# Hotspots Report

**Generated:** ${snapshot.timestamp}

No hotspot files detected.
`
  }

  const rows = hotspots.map(f =>
    `| ${f.path} | ${f.hotspotScore ?? 'N/A'} | ${f.hotspotTrend ?? '—'} | ${f.commits6mo} | ${f.complexityDensity ?? 'N/A'} | ${f.fanIn ?? 0} |`
  ).join('\n')

  return `# Hotspots Report

**Generated:** ${snapshot.timestamp}
**Hotspot Count:** ${hotspots.length}

| File | Score | Trend | Commits (6mo) | Complexity Density | Fan-In |
|------|-------|-------|---------------|-------------------|--------|
${rows}
`
}

export function renderCoverageReport(snapshot: Snapshot): string {
  const sourceFiles = Object.values(snapshot.files).filter(f => f.classification === 'source')
  const withCoverage = sourceFiles.filter(f => f.lineCoverage != null)

  if (withCoverage.length === 0) {
    return `# Coverage Report

**Generated:** ${snapshot.timestamp}

No coverage data available. Run \`/qa-snapshot --coverage\` to collect coverage.
`
  }

  const uncovered = withCoverage
    .filter(f => (f.lineCoverage ?? 0) < 50)
    .sort((a, b) => (a.lineCoverage ?? 0) - (b.lineCoverage ?? 0))

  const rows = uncovered.map(f =>
    `| ${f.path} | ${pct(f.lineCoverage)} | ${pct(f.branchCoverage)} | ${f.domain ?? '—'} |`
  ).join('\n')

  return `# Coverage Report

**Generated:** ${snapshot.timestamp}
**Aggregate Line Coverage:** ${pct(snapshot.summary.totalCoverage)}
**Files With Coverage Data:** ${withCoverage.length}
**Files Below 50% Coverage:** ${uncovered.length}

## Low Coverage Files

| File | Line Coverage | Branch Coverage | Domain |
|------|-------------|----------------|--------|
${rows}
`
}

export function renderChangelogReport(snapshot: Snapshot): string {
  const { diff, timestamp } = snapshot

  if (!diff) {
    return `# Changelog

**Generated:** ${timestamp}

This is the first snapshot — no previous data to compare against.
`
  }

  const improved = diff.improved.length
    ? diff.improved.map(f => `- ${f}`).join('\n')
    : 'None'

  const regressed = diff.regressed.length
    ? diff.regressed.map(f => `- ${f}`).join('\n')
    : 'None'

  const added = diff.added.length
    ? diff.added.map(f => `- ${f}`).join('\n')
    : 'None'

  const removed = diff.removed.length
    ? diff.removed.map(f => `- ${f}`).join('\n')
    : 'None'

  return `# Changelog

**Generated:** ${timestamp}
**Summary:** ${diff.summary}

## Improved

${improved}

## Regressed

${regressed}

## Added

${added}

## Removed

${removed}
`
}

/**
 * Generate all reports from a snapshot and write to .qastate/reports/.
 */
export function generateAllReports(snapshot: Snapshot): void {
  const reportsDir = `${process.cwd()}/.qastate/reports`
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(`${reportsDir}/health.md`, renderHealthReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/hotspots.md`, renderHotspotsReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/coverage.md`, renderCoverageReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/changelog.md`, renderChangelogReport(snapshot), 'utf8')
}
