import { describe, it, expect } from 'vitest'
import { renderHealthReport, renderHotspotsReport, renderCoverageReport, renderChangelogReport } from '../templates.js'
import type { Snapshot, FileEntry, SnapshotSummary } from '../types.js'

function makeSummary(overrides: Partial<SnapshotSummary> = {}): SnapshotSummary {
  return {
    healthScore: 72, healthGrade: 'C',
    totalFiles: 57, filesScored: 57, avgMaintainability: 91.2,
    totalCoverage: 64, deadCodeFiles: 2, deadCodeExports: 5,
    duplicationPercent: 1.5, circularDeps: 1, tscErrors: 3,
    hotspotCount: 2, patternViolationCount: 4, testsTracked: 10,
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

  /* QA-10380 */ it('[QA-10380] includes key metrics table', () => {
    const md = renderHealthReport(makeSnapshot())
    expect(md).toContain('Dead Code Exports')
    expect(md).toContain('Duplication')
  })
})

describe('renderHotspotsReport', () => {
  /* QA-10381 */ it('[QA-10381] lists hotspot files', () => {
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
    expect(md).toContain('cooling')
  })
})

describe('renderCoverageReport', () => {
  /* QA-10382 */ it('[QA-10382] shows no-data message when no coverage', () => {
    const md = renderCoverageReport(makeSnapshot())
    expect(md).toContain('No coverage data')
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
})

describe('renderChangelogReport', () => {
  /* QA-10384 */ it('[QA-10384] shows diff summary when available', () => {
    const md = renderChangelogReport(makeSnapshot({
      diff: {
        improved: ['src/a.ts'], regressed: ['src/b.ts'],
        added: [], removed: [],
        summary: '1 improved, 1 regressed',
      },
    }))
    expect(md).toContain('1 improved, 1 regressed')
    expect(md).toContain('src/a.ts')
    expect(md).toContain('src/b.ts')
  })

  /* QA-10385 */ it('[QA-10385] shows "first snapshot" when no diff', () => {
    const md = renderChangelogReport(makeSnapshot({ diff: null }))
    expect(md).toContain('first snapshot')
  })
})
