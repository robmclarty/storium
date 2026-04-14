import { writeFileSync, mkdirSync } from 'node:fs'
import type { Snapshot, FileEntry, ChangelogEntry } from './types.js'
import { healthPath } from './utils.js'

function pct(n: number | null): string {
  return n !== null ? `${Math.round(n * 10) / 10}%` : 'N/A'
}

function assessFile(f: FileEntry): string {
  const tests = f.coveredByTests.length
  const cyc = f.totalCyclomatic ?? 0
  if (tests >= 10 && cyc > 50) return 'Well-tested, high complexity'
  if (tests >= 5 && cyc <= 50) return 'Adequate'
  if (tests < 5 && cyc > 20) return 'Under-tested for complexity'
  if (tests === 0) return 'No test coverage'
  return 'Light coverage'
}

// ---------------------------------------------------------------------------
// Health Dashboard
// ---------------------------------------------------------------------------

export function renderHealthReport(snapshot: Snapshot): string {
  const { summary, timestamp } = snapshot
  const score = summary.healthScore ?? 0
  const grade = summary.healthGrade ?? 'N/A'

  // --- Summary narrative ---
  const concerns: string[] = []

  if (summary.deadCodeFiles > 0 || summary.deadCodeExports > 0) {
    concerns.push(`${summary.deadCodeFiles} file(s) with dead code (${summary.deadCodeExports} dead export(s))`)
  }
  if (summary.duplicationPercent >= 5) {
    concerns.push(`${pct(summary.duplicationPercent)} code duplication`)
  } else if (summary.duplicationPercent > 0) {
    concerns.push(`low duplication (${pct(summary.duplicationPercent)})`)
  }
  if (summary.circularDeps > 0) {
    concerns.push(`${summary.circularDeps} circular dependenc${summary.circularDeps === 1 ? 'y' : 'ies'}`)
  }
  if (summary.tscErrors > 0) {
    concerns.push(`${summary.tscErrors} TypeScript error(s)`)
  }
  if (summary.patternViolationCount > 0) {
    concerns.push(`${summary.patternViolationCount} pattern violation(s)`)
  }

  const allFiles = Object.values(snapshot.files)
  const sourceFiles = allFiles.filter(f => f.classification === 'source')
  const accelerating = sourceFiles.filter(f => f.hotspotTrend === 'accelerating')
  if (accelerating.length > 0) {
    concerns.push(`${accelerating.length} accelerating hotspot(s)`)
  }

  // Check if top 3 source files hold > 30% of total cyclomatic complexity
  const totalCyc = sourceFiles.reduce((sum, f) => sum + (f.totalCyclomatic ?? 0), 0)
  if (totalCyc > 0) {
    const top3Cyc = sourceFiles
      .toSorted((a, b) => (b.totalCyclomatic ?? 0) - (a.totalCyclomatic ?? 0))
      .slice(0, 3)
      .reduce((sum, f) => sum + (f.totalCyclomatic ?? 0), 0)
    if (top3Cyc / totalCyc > 0.3) {
      concerns.push('complexity concentrated in top 3 files (>30% of total)')
    }
  }

  let opener: string
  if (grade === 'A') opener = 'Codebase is healthy overall.'
  else if (grade === 'B') opener = 'Codebase is in good shape with minor concerns.'
  else opener = 'Codebase has areas needing attention.'

  let narrative: string
  if (concerns.length === 0) {
    narrative = 'Codebase is in excellent shape. All vital signs are clean.'
  } else {
    narrative = `${opener} Concerns: ${concerns.join(', ')}.`
  }

  // --- Vital Signs table ---
  const maintStatus =
    (summary.avgMaintainability ?? 0) > 85 ? 'Good' :
    (summary.avgMaintainability ?? 0) >= 70 ? 'Moderate' : 'Poor'

  const deadStatus =
    summary.deadCodeFiles === 0 && summary.deadCodeExports === 0 ? 'Clean' : 'Warning'

  const dupeStatus =
    summary.duplicationPercent === 0 ? 'Clean' :
    summary.duplicationPercent < 5 ? 'Low' : 'Warning'

  const circStatus = summary.circularDeps === 0 ? 'Clean' : 'Warning'
  const tscStatus = summary.tscErrors === 0 ? 'Clean' : 'Failing'
  const patternStatus = summary.patternViolationCount === 0 ? 'Clean' : 'Warning'

  const sourcesWithTests = sourceFiles.filter(f => f.coveredByTests.length > 0).length
  const testBreadthPct = sourceFiles.length > 0
    ? Math.round((sourcesWithTests / sourceFiles.length) * 100)
    : 0
  const testBreadthStatus = testBreadthPct === 100 ? 'Good' : `Gap (${testBreadthPct}%)`

  const vitalRows = [
    `| Maintainability | ${summary.avgMaintainability ?? 'N/A'} | ${maintStatus} |`,
    `| Dead Code | ${summary.deadCodeFiles} files, ${summary.deadCodeExports} exports | ${deadStatus} |`,
    `| Duplication | ${pct(summary.duplicationPercent)} | ${dupeStatus} |`,
    `| Circular Deps | ${summary.circularDeps} | ${circStatus} |`,
    `| TSC Errors | ${summary.tscErrors} | ${tscStatus} |`,
    `| Pattern Violations | ${summary.patternViolationCount} | ${patternStatus} |`,
    `| Test Breadth | ${sourcesWithTests}/${sourceFiles.length} source files | ${testBreadthStatus} |`,
  ].join('\n')

  // --- Score Breakdown ---
  let scoreBreakdown = ''
  if (summary.penalties && Object.keys(summary.penalties).length > 0) {
    const penaltyEntries = Object.entries(summary.penalties)
      .filter(([, v]) => v > 0)
      .toSorted((a, b) => b[1] - a[1])

    if (penaltyEntries.length > 0) {
      const total = penaltyEntries.reduce((sum, [, v]) => sum + v, 0)
      const rows = penaltyEntries
        .map(([name, pts]) => `| ${name.replace(/_/g, ' ')} | -${pts} |`)
        .join('\n')
      scoreBreakdown = `
## Score Breakdown

| Penalty | Points |
|---------|--------|
${rows}
| **Total deducted** | **-${total}** |
`
    }
  }

  // --- Risk Profile ---
  const cooling = sourceFiles.filter(f => f.hotspotTrend === 'cooling')
  const top5Accel = accelerating
    .slice()
    .toSorted((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))
    .slice(0, 5)
  const top5Cool = cooling
    .slice()
    .toSorted((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))
    .slice(0, 5)

  let riskProfile = '\n## Risk Profile\n\n'
  if (top5Accel.length === 0 && top5Cool.length === 0) {
    riskProfile += 'No hotspot risk signals detected.\n'
  } else {
    if (top5Accel.length > 0) {
      riskProfile += '**Accelerating:**\n\n'
      riskProfile += top5Accel.map(f => `- ${f.path} (score: ${f.hotspotScore ?? 'N/A'})`).join('\n')
      riskProfile += '\n\n'
    }
    if (top5Cool.length > 0) {
      riskProfile += '**Cooling:**\n\n'
      riskProfile += top5Cool.map(f => `- ${f.path} (score: ${f.hotspotScore ?? 'N/A'})`).join('\n')
      riskProfile += '\n'
    }
  }

  // --- File Distribution ---
  const classMap: Record<string, { files: number; hotspots: number }> = {}
  for (const f of allFiles) {
    const cls = f.classification
    if (!classMap[cls]) classMap[cls] = { files: 0, hotspots: 0 }
    classMap[cls].files++
    if (f.isHotspot) classMap[cls].hotspots++
  }

  const distRows = Object.entries(classMap)
    .toSorted((a, b) => b[1].files - a[1].files)
    .map(([cls, data]) => `| ${cls} | ${data.files} | ${data.hotspots} |`)
    .join('\n')

  const fileDistSection = distRows
    ? `\n## File Distribution\n\n| Classification | Files | Hotspots |\n|----------------|-------|----------|\n${distRows}\n`
    : ''

  return `# Health Dashboard

**Generated:** ${timestamp} | **Score:** ${score}/100 (${grade})

## Summary

${narrative}

## Vital Signs

| Metric | Value | Status |
|--------|-------|--------|
${vitalRows}
${scoreBreakdown}${riskProfile}${fileDistSection}`
}

// ---------------------------------------------------------------------------
// Hotspots Dashboard
// ---------------------------------------------------------------------------

function sourceRow(f: FileEntry): string {
  return `| ${f.path} | ${f.hotspotScore ?? 'N/A'} | ${f.totalCyclomatic ?? 'N/A'} | ${f.totalCognitive ?? 'N/A'} | ${f.lines ?? 'N/A'} | ${f.commits6mo} | ${f.fanIn ?? 0} | ${f.coveredByTests.length} |`
}

function testRow(f: FileEntry): string {
  return `| ${f.path} | ${f.hotspotScore ?? 'N/A'} | ${f.hotspotTrend ?? '—'} | ${f.commits6mo} |`
}

export function renderHotspotsReport(snapshot: Snapshot): string {
  const { timestamp } = snapshot
  const allFiles = Object.values(snapshot.files)

  const sourceHotspots = allFiles.filter(f => f.isHotspot && f.classification === 'source')
  const testHotspots = allFiles.filter(f => f.isHotspot && f.classification === 'test')

  const accelerating = sourceHotspots.filter(f => f.hotspotTrend === 'accelerating').toSorted((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))
  const stable = sourceHotspots.filter(f => f.hotspotTrend === 'stable').toSorted((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))
  const cooling = sourceHotspots.filter(f => f.hotspotTrend === 'cooling').toSorted((a, b) => (b.hotspotScore ?? 0) - (a.hotspotScore ?? 0))

  // Overview line
  let overview = `${accelerating.length} accelerating, ${stable.length} stable, ${cooling.length} cooling.`

  // Cluster detection: if >50% of accelerating source files share a parent dir
  if (accelerating.length >= 2) {
    const dirCounts: Record<string, number> = {}
    for (const f of accelerating) {
      const parts = f.path.split('/')
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
      dirCounts[dir] = (dirCounts[dir] ?? 0) + 1
    }
    const topDir = Object.entries(dirCounts).toSorted((a, b) => b[1] - a[1])[0]
    if (topDir && topDir[1] / accelerating.length > 0.5) {
      overview += ` Cluster detected in \`${topDir[0]}\` (${topDir[1]} of ${accelerating.length} accelerating files).`
    }
  }

  const sourceHeader = '| File | Score | Cyc | Cog | Lines | Commits (6mo) | Fan-In | Tests |\n|------|-------|-----|-----|-------|---------------|--------|-------|'

  const sections: string[] = []

  if (accelerating.length > 0) {
    sections.push(`## Accelerating\n\n${sourceHeader}\n${accelerating.map(sourceRow).join('\n')}`)
  }
  if (stable.length > 0) {
    sections.push(`## Stable\n\n${sourceHeader}\n${stable.map(sourceRow).join('\n')}`)
  }
  if (cooling.length > 0) {
    sections.push(`## Cooling\n\n${sourceHeader}\n${cooling.map(sourceRow).join('\n')}`)
  }
  if (testHotspots.length > 0) {
    const testHeader = '| File | Score | Trend | Commits (6mo) |\n|------|-------|-------|---------------|'
    sections.push(`## Test File Hotspots\n\n${testHeader}\n${testHotspots.map(testRow).join('\n')}`)
  }

  if (sourceHotspots.length === 0 && testHotspots.length === 0) {
    return `# Hotspots Dashboard

**Generated:** ${timestamp}

No hotspot files detected.
`
  }

  return `# Hotspots Dashboard

**Generated:** ${timestamp}

**Overview:** ${overview}

${sections.join('\n\n')}
`
}

// ---------------------------------------------------------------------------
// Coverage Dashboard
// ---------------------------------------------------------------------------

export function renderCoverageReport(snapshot: Snapshot): string {
  const { timestamp } = snapshot
  const allFiles = Object.values(snapshot.files)
  const sourceFiles = allFiles.filter(f => f.classification === 'source')
  const withCoverage = sourceFiles.filter(f => f.lineCoverage !== null)

  // --- Istanbul Coverage section ---
  let istanbulSection: string
  if (withCoverage.length === 0) {
    istanbulSection = `## Istanbul Coverage

No istanbul data. Run with \`--coverage\` to collect line/branch metrics.`
  } else {
    const uncovered = withCoverage
      .filter(f => (f.lineCoverage ?? 0) < 50)
      .toSorted((a, b) => (a.lineCoverage ?? 0) - (b.lineCoverage ?? 0))

    const rows = uncovered
      .map(f => `| ${f.path} | ${pct(f.lineCoverage)} | ${pct(f.branchCoverage)} | ${f.domain ?? '—'} |`)
      .join('\n')

    istanbulSection = `## Istanbul Coverage

**Aggregate Line Coverage:** ${pct(snapshot.summary.totalCoverage)}
**Files With Coverage Data:** ${withCoverage.length}
**Files Below 50%:** ${uncovered.length}

${uncovered.length > 0 ? `| File | Line Coverage | Branch Coverage | Domain |\n|------|-------------|----------------|--------|\n${rows}` : 'All instrumented files are above 50% line coverage.'}`
  }

  // --- Test Mapping section (always shown) ---
  const sourcesWithTests = sourceFiles.filter(f => f.coveredByTests.length > 0).length
  const breadthPct = sourceFiles.length > 0
    ? Math.round((sourcesWithTests / sourceFiles.length) * 1000) / 10
    : 0

  const mappingRows = sourceFiles
    .toSorted((a, b) => a.coveredByTests.length - b.coveredByTests.length)
    .map(f => `| ${f.path} | ${f.coveredByTests.length} | ${f.totalCyclomatic ?? 'N/A'} | ${assessFile(f)} |`)
    .join('\n')

  const mappingTable = mappingRows
    ? `| File | Tests | Cyclomatic | Assessment |\n|------|-------|-----------|------------|\n${mappingRows}`
    : 'No source files tracked.'

  // Potential Gaps: files where coveredByTests.length < totalCyclomatic / 10
  const gaps = sourceFiles
    .filter(f => (f.totalCyclomatic ?? 0) > 0 && f.coveredByTests.length < (f.totalCyclomatic ?? 0) / 10)
    .toSorted((a, b) => (b.totalCyclomatic ?? 0) - (a.totalCyclomatic ?? 0))

  const gapRows = gaps
    .map(f => `| ${f.path} | ${f.coveredByTests.length} | ${f.totalCyclomatic ?? 'N/A'} |`)
    .join('\n')

  const gapSection = gaps.length > 0
    ? `\n### Potential Gaps\n\n| File | Tests | Cyclomatic |\n|------|-------|----------|\n${gapRows}`
    : '\n### Potential Gaps\n\nNo significant gaps detected.'

  const testMappingSection = `## Test Mapping

**Breadth:** ${sourcesWithTests}/${sourceFiles.length} source files have registered tests (${breadthPct}%).

${mappingTable}${gapSection}`

  return `# Coverage Dashboard

**Generated:** ${timestamp}

${istanbulSection}

${testMappingSection}
`
}

// ---------------------------------------------------------------------------
// Changelog Dashboard
// ---------------------------------------------------------------------------

export function renderChangelogReport(snapshot: Snapshot, changelog: ChangelogEntry[] = []): string {
  const { timestamp } = snapshot

  if (changelog.length === 0) {
    return `# Changelog

**Generated:** ${timestamp}

No history available. Run multiple snapshots to build a changelog.
`
  }

  const sections: string[] = []

  for (const entry of changelog) {
    const { from, to, diff } = entry
    let section = `## ${from} → ${to}\n\n`

    if (diff.improved.length === 0 && diff.regressed.length === 0 && diff.added.length === 0 && diff.removed.length === 0) {
      section += 'No changes detected.\n\n---'
    } else {
      section += `${diff.summary}\n`

      if (diff.improved.length > 0) {
        section += '\n**Improved:**\n\n'
        section += diff.improved.map(path => {
          const d = diff.deltas?.[path]
          if (d) {
            const delta = Math.round((d.to - d.from) * 10) / 10
            return `- ${path} — maintainability ${d.from} → ${d.to} (+${delta})`
          }
          return `- ${path}`
        }).join('\n')
        section += '\n'
      }

      if (diff.regressed.length > 0) {
        section += '\n**Regressed:**\n\n'
        section += diff.regressed.map(path => {
          const d = diff.deltas?.[path]
          if (d) {
            const delta = Math.round((d.to - d.from) * 10) / 10
            return `- ${path} — maintainability ${d.from} → ${d.to} (${delta})`
          }
          return `- ${path}`
        }).join('\n')
        section += '\n'
      }

      if (diff.added.length > 0) {
        section += '\n**Added:**\n\n'
        section += diff.added.map(f => `- ${f}`).join('\n')
        section += '\n'
      }

      if (diff.removed.length > 0) {
        section += '\n**Removed:**\n\n'
        section += diff.removed.map(f => `- ${f}`).join('\n')
        section += '\n'
      }
    }

    sections.push(section)
  }

  return `# Changelog

**Generated:** ${timestamp}

${sections.join('\n\n')}
`
}

// ---------------------------------------------------------------------------
// Generate all reports
// ---------------------------------------------------------------------------

/**
 * Generate all reports from a snapshot and write to .health/reports/.
 */
export function generateAllReports(snapshot: Snapshot, changelog: ChangelogEntry[] = []): void {
  const reportsDir = healthPath('reports')
  mkdirSync(reportsDir, { recursive: true })

  writeFileSync(`${reportsDir}/health.md`, renderHealthReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/hotspots.md`, renderHotspotsReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/coverage.md`, renderCoverageReport(snapshot), 'utf8')
  writeFileSync(`${reportsDir}/changelog.md`, renderChangelogReport(snapshot, changelog), 'utf8')
}
