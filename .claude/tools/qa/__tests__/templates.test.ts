import { describe, it, expect } from 'vitest'
import { renderHealthReport, renderHotspotsReport, renderCoverageReport, renderChangelogReport } from '../templates.js'
import type { Snapshot, FileEntry, SnapshotSummary, ChangelogEntry } from '../types.js'

function makeSummary(overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
  return {
    healthScore: 72, healthGrade: 'C',
    totalFiles: 57, filesScored: 57, avgMaintainability: 91.2,
    totalCoverage: 64, deadCodeFiles: 2, deadCodeExports: 5,
    duplicationPercent: 1.5, circularDeps: 1, tscErrors: 3,
    hotspotCount: 2, patternViolationCount: 4, testsTracked: 10,
    penalties: null,
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    timestamp: '2026-04-13T14:30:00Z',
    command: 'qa-snapshot',
    summary: makeSummary(),
    files: {},
    diff: null,
    ...overrides,
  }
}

describe('renderHealthReport', () => {
  /* QA-10379 */ it('[QA-10379] includes health score and grade', () => {
    const md = renderHealthReport(makeSnapshot())
    expect(md).toContain('72/100')
    expect(md).toContain('C')
  })

  /* QA-10380 */ it('[QA-10380] includes Health Dashboard title and key sections', () => {
    const md = renderHealthReport(makeSnapshot())
    expect(md).toContain('Health Dashboard')
    expect(md).toContain('Vital Signs')
    expect(md).toContain('Summary')
  })

  it('renders score breakdown when penalties present', () => {
    const md = renderHealthReport(makeSnapshot({
      summary: makeSummary({ penalties: { dead_code: 5, duplication: 3 } }),
    }))
    expect(md).toContain('Score Breakdown')
    expect(md).toContain('dead code')
    expect(md).toContain('-5')
  })

  it('omits score breakdown when penalties are null', () => {
    const md = renderHealthReport(makeSnapshot({ summary: makeSummary({ penalties: null }) }))
    expect(md).not.toContain('Score Breakdown')
  })
})

describe('renderHotspotsReport', () => {
  /* QA-10381 */ it('[QA-10381] places cooling hotspot in Cooling section', () => {
    const files: Record<string, FileEntry> = {
      'src/connect.ts': {
        path: 'src/connect.ts', classification: 'source', domain: 'core',
        maintainability: 85, complexityDensity: 0.21, totalCyclomatic: 86,
        totalCognitive: 57, functionCount: 25, lines: 410, crapMax: 116,
        fanIn: 2, fanOut: 6, deadCodeRatio: 0,
        isHotspot: true, hotspotScore: 77.8, hotspotTrend: 'cooling',
        hasDeadExports: false, deadExportCount: 0,
        hasDuplicates: false, duplicateLineCount: 0,
        circularWith: [], dependencyDepth: 0, patternViolations: [],
        tscErrorCount: 0, lineCoverage: null, branchCoverage: null,
        commits6mo: 35, authors6mo: 2, lastModified: '2026-04-13',
        coveredByTests: [],
      },
    }
    const md = renderHotspotsReport(makeSnapshot({ files }))
    expect(md).toContain('src/connect.ts')
    expect(md).toContain('77.8')
    // File is cooling, so it should appear under the Cooling section
    const coolingIdx = md.indexOf('## Cooling')
    const fileIdx = md.indexOf('src/connect.ts')
    expect(coolingIdx).toBeGreaterThan(-1)
    expect(fileIdx).toBeGreaterThan(coolingIdx)
  })

  it('shows no hotspots message when files map is empty', () => {
    const md = renderHotspotsReport(makeSnapshot())
    expect(md).toContain('No hotspot files detected')
  })

  it('detects directory cluster for accelerating hotspots', () => {
    const makeHotspot = (path: string): FileEntry => ({
      path, classification: 'source', domain: 'core',
      maintainability: 70, complexityDensity: 0.3, totalCyclomatic: 50,
      totalCognitive: 40, functionCount: 15, lines: 200, crapMax: 60,
      fanIn: 3, fanOut: 5, deadCodeRatio: 0,
      isHotspot: true, hotspotScore: 80, hotspotTrend: 'heating',
      hasDeadExports: false, deadExportCount: 0,
      hasDuplicates: false, duplicateLineCount: 0,
      circularWith: [], dependencyDepth: 0, patternViolations: [],
      tscErrorCount: 0, lineCoverage: null, branchCoverage: null,
      commits6mo: 40, authors6mo: 2, lastModified: '2026-04-13',
      coveredByTests: [],
    })
    const files: Record<string, FileEntry> = {
      'src/core/a.ts': makeHotspot('src/core/a.ts'),
      'src/core/b.ts': makeHotspot('src/core/b.ts'),
      'src/other/c.ts': makeHotspot('src/other/c.ts'),
    }
    const md = renderHotspotsReport(makeSnapshot({ files }))
    expect(md).toContain('Cluster detected in `src/core`')
  })
})

describe('renderCoverageReport', () => {
  /* QA-10382 */ it('[QA-10382] shows "No istanbul data" AND "Test Mapping" when no coverage', () => {
    const md = renderCoverageReport(makeSnapshot())
    expect(md).toContain('No istanbul data')
    expect(md).toContain('Test Mapping')
  })

  /* QA-10383 */ it('[QA-10383] lists low coverage files when data is available', () => {
    const files: Record<string, FileEntry> = {
      'src/weak.ts': {
        path: 'src/weak.ts', classification: 'source', domain: 'core',
        maintainability: 80, complexityDensity: 0.1, totalCyclomatic: 10,
        totalCognitive: 5, functionCount: 3, lines: 100, crapMax: 10,
        fanIn: 1, fanOut: 1, deadCodeRatio: 0,
        isHotspot: false, hotspotScore: null, hotspotTrend: null,
        hasDeadExports: false, deadExportCount: 0,
        hasDuplicates: false, duplicateLineCount: 0,
        circularWith: [], dependencyDepth: 0, patternViolations: [],
        tscErrorCount: 0, lineCoverage: 25, branchCoverage: 10,
        commits6mo: 5, authors6mo: 1, lastModified: '2026-04-13',
        coveredByTests: [],
      },
    }
    const md = renderCoverageReport(makeSnapshot({ files, summary: makeSummary({ totalCoverage: 25 }) }))
    expect(md).toContain('src/weak.ts')
    expect(md).toContain('25%')
  })

  it('always shows Test Mapping section even with coverage data', () => {
    const files: Record<string, FileEntry> = {
      'src/well.ts': {
        path: 'src/well.ts', classification: 'source', domain: 'core',
        maintainability: 95, complexityDensity: 0.1, totalCyclomatic: 8,
        totalCognitive: 4, functionCount: 2, lines: 80, crapMax: 5,
        fanIn: 1, fanOut: 1, deadCodeRatio: 0,
        isHotspot: false, hotspotScore: null, hotspotTrend: null,
        hasDeadExports: false, deadExportCount: 0,
        hasDuplicates: false, duplicateLineCount: 0,
        circularWith: [], dependencyDepth: 0, patternViolations: [],
        tscErrorCount: 0, lineCoverage: 90, branchCoverage: 85,
        commits6mo: 5, authors6mo: 1, lastModified: '2026-04-13',
        coveredByTests: ['QA-10001'],
      },
    }
    const md = renderCoverageReport(makeSnapshot({ files, summary: makeSummary({ totalCoverage: 90 }) }))
    expect(md).toContain('Test Mapping')
    expect(md).toContain('Istanbul Coverage')
  })
})

describe('renderChangelogReport', () => {
  /* QA-10384 */ it('[QA-10384] shows diff summary when changelog entries passed', () => {
    const changelog: ChangelogEntry[] = [{
      from: '2026-04-12T10:00:00Z',
      to: '2026-04-13T14:30:00Z',
      diff: {
        improved: ['src/a.ts'], regressed: ['src/b.ts'],
        added: [], removed: [],
        summary: '1 improved, 1 regressed',
        deltas: {
          'src/a.ts': { from: 70, to: 80 },
          'src/b.ts': { from: 85, to: 75 },
        },
      },
    }]
    const md = renderChangelogReport(makeSnapshot(), changelog)
    expect(md).toContain('1 improved, 1 regressed')
    expect(md).toContain('src/a.ts')
    expect(md).toContain('src/b.ts')
  })

  /* QA-10385 */ it('[QA-10385] shows "No history available" when no changelog entries', () => {
    const md = renderChangelogReport(makeSnapshot(), [])
    expect(md).toContain('No history available')
  })

  it('includes per-file maintainability deltas in improved section', () => {
    const changelog: ChangelogEntry[] = [{
      from: '2026-04-12T10:00:00Z',
      to: '2026-04-13T14:30:00Z',
      diff: {
        improved: ['src/a.ts'], regressed: [],
        added: [], removed: [],
        summary: '1 improved',
        deltas: { 'src/a.ts': { from: 70, to: 80 } },
      },
    }]
    const md = renderChangelogReport(makeSnapshot(), changelog)
    expect(md).toContain('maintainability 70 → 80')
    expect(md).toContain('+10')
  })
})
