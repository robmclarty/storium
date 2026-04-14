import { describe, it, expect } from 'vitest'
import type {
  Snapshot,
  FileEntry,
  SnapshotDiff,
  SnapshotSummary,
  Learning,
  LearningsFile,
  TestRegistryEntry,
  TestRegistry,
  QAConfig,
  PatternViolation,
} from '../types.js'
import { mergeToolOutputs, diffSnapshots, buildSummary } from '../snapshot.js'

describe('types', () => {
  it('Snapshot structure is well-typed', () => {
    const entry: FileEntry = {
      path: 'src/index.ts',
      classification: 'source',
      domain: 'core',
      maintainability: 85.9,
      complexityDensity: 0.21,
      totalCyclomatic: 86,
      totalCognitive: 57,
      functionCount: 25,
      lines: 410,
      crapMax: 116.3,
      fanIn: 2,
      fanOut: 6,
      deadCodeRatio: 0.0,
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
      commits6mo: 35,
      authors6mo: 2,
      lastModified: '2026-04-13',
      coveredByTests: [],
    }

    const snapshot: Snapshot = {
      timestamp: '2026-04-13T14:30:00Z',
      command: 'qa-snapshot',
      summary: {
        healthScore: 72,
        healthGrade: 'C',
        totalFiles: 128,
        filesScored: 57,
        avgMaintainability: 91.2,
        totalCoverage: null,
        deadCodeFiles: 0,
        deadCodeExports: 0,
        duplicationPercent: 0.0,
        circularDeps: 0,
        tscErrors: 0,
        hotspotCount: 1,
        patternViolationCount: 0,
        testsTracked: 0,
      },
      files: { 'src/index.ts': entry },
      diff: null,
    }

    expect(snapshot.summary.healthScore).toBe(72)
    expect(snapshot.files['src/index.ts'].maintainability).toBe(85.9)
  })

  it('Learning structure is well-typed', () => {
    const learning: Learning = {
      id: 'abc123',
      domain: 'coverage',
      insight: 'Auth module has consistently low coverage',
      confidence: 'medium',
      source: 'qa-analyze',
      context: {
        files: ['src/auth/session.ts'],
        metrics: { lineCoverage: 32 },
      },
      firstSeen: '2026-04-13',
      lastConfirmed: '2026-04-13',
    }

    expect(learning.confidence).toBe('medium')
  })

  it('TestRegistryEntry structure is well-typed', () => {
    const entry: TestRegistryEntry = {
      id: 'QA-10000',
      name: 'should hash password before storing',
      suite: 'UserService',
      file: 'src/users/__tests__/user.test.ts',
      line: 42,
      type: 'unit',
      status: 'active',
      coveredFiles: ['src/users/user.service.ts'],
      coveredFunctions: ['hashPassword'],
      lastVerified: '2026-04-13',
      lastPassed: '2026-04-13',
      createdAt: '2026-04-13',
    }

    expect(entry.id).toBe('QA-10000')
  })
})

describe('mergeToolOutputs', () => {
  it('merges fallow file_scores into FileEntry records', () => {
    const fallowHealth = {
      file_scores: [{
        path: 'src/index.ts',
        fan_in: 2, fan_out: 6, dead_code_ratio: 0.0,
        complexity_density: 0.21, maintainability_index: 85.9,
        total_cyclomatic: 86, total_cognitive: 57,
        function_count: 25, lines: 410, crap_max: 116.3,
        crap_above_threshold: 2,
      }],
      hotspots: [],
      vital_signs: { circular_dep_count: 0 },
      health_score: { score: 72, grade: 'C' },
    }

    const result = mergeToolOutputs({
      fallowHealth,
      fallowDeadCode: { unused_files: [], unused_exports: [], circular_dependencies: [], summary: { circular_dependencies: 0 } },
      fallowDupes: { clone_groups: [], stats: { duplication_percentage: 0, duplicated_lines: 0 } },
      depcruise: null,
      astgrep: null,
      tscErrors: {},
      gitStats: {},
      knip: null,
      coverage: null,
    })

    const file = result['src/index.ts']
    expect(file).toBeDefined()
    expect(file.maintainability).toBe(85.9)
    expect(file.fanIn).toBe(2)
    expect(file.totalCyclomatic).toBe(86)
    expect(file.classification).toBe('source')
  })

  it('merges hotspot data into matching FileEntry', () => {
    const fallowHealth = {
      file_scores: [{
        path: 'src/connect.ts',
        fan_in: 2, fan_out: 6, dead_code_ratio: 0.0,
        complexity_density: 0.21, maintainability_index: 85.9,
        total_cyclomatic: 86, total_cognitive: 57,
        function_count: 25, lines: 410, crap_max: 116.3,
        crap_above_threshold: 2,
      }],
      hotspots: [{
        path: 'src/connect.ts',
        score: 77.8, commits: 35, weighted_commits: 28.56,
        lines_added: 672, lines_deleted: 263,
        complexity_density: 0.21, fan_in: 2, trend: 'cooling',
      }],
      vital_signs: { circular_dep_count: 0 },
      health_score: { score: 72, grade: 'C' },
    }

    const result = mergeToolOutputs({
      fallowHealth,
      fallowDeadCode: { unused_files: [], unused_exports: [], circular_dependencies: [], summary: { circular_dependencies: 0 } },
      fallowDupes: { clone_groups: [], stats: { duplication_percentage: 0, duplicated_lines: 0 } },
      depcruise: null,
      astgrep: null,
      tscErrors: {},
      gitStats: {},
      knip: null,
      coverage: null,
    })

    const file = result['src/connect.ts']
    expect(file.isHotspot).toBe(true)
    expect(file.hotspotScore).toBe(77.8)
    expect(file.hotspotTrend).toBe('cooling')
  })

  it('merges ast-grep violations into FileEntry', () => {
    const fallowHealth = {
      file_scores: [{ path: 'src/handler.ts', fan_in: 0, fan_out: 1, dead_code_ratio: 0, complexity_density: 0.1, maintainability_index: 90, total_cyclomatic: 5, total_cognitive: 3, function_count: 2, lines: 50, crap_max: 5, crap_above_threshold: 0 }],
      hotspots: [],
      vital_signs: { circular_dep_count: 0 },
      health_score: { score: 80, grade: 'B' },
    }

    const astgrep = [
      { path: 'src/handler.ts', rule: 'no-empty-catch', line: 12, message: 'Empty catch block' },
    ]

    const result = mergeToolOutputs({
      fallowHealth,
      fallowDeadCode: { unused_files: [], unused_exports: [], circular_dependencies: [], summary: { circular_dependencies: 0 } },
      fallowDupes: { clone_groups: [], stats: { duplication_percentage: 0, duplicated_lines: 0 } },
      depcruise: null,
      astgrep,
      tscErrors: {},
      gitStats: {},
      knip: null,
      coverage: null,
    })

    expect(result['src/handler.ts'].patternViolations).toEqual([
      { rule: 'no-empty-catch', line: 12, message: 'Empty catch block' },
    ])
  })
})

describe('diffSnapshots', () => {
  it('returns null when no previous snapshot', () => {
    const result = diffSnapshots(null, { 'src/a.ts': { maintainability: 80 } as FileEntry })
    expect(result).toBeNull()
  })

  it('detects added and removed files', () => {
    const prev = { 'src/old.ts': { maintainability: 80 } as FileEntry }
    const curr = { 'src/new.ts': { maintainability: 90 } as FileEntry }

    const diff = diffSnapshots(prev, curr)!
    expect(diff.added).toContain('src/new.ts')
    expect(diff.removed).toContain('src/old.ts')
  })

  it('detects improved and regressed files by maintainability', () => {
    const prev = {
      'src/a.ts': { maintainability: 80 } as FileEntry,
      'src/b.ts': { maintainability: 90 } as FileEntry,
    }
    const curr = {
      'src/a.ts': { maintainability: 85 } as FileEntry,
      'src/b.ts': { maintainability: 70 } as FileEntry,
    }

    const diff = diffSnapshots(prev, curr)!
    expect(diff.improved).toContain('src/a.ts')
    expect(diff.regressed).toContain('src/b.ts')
  })
})

describe('buildSummary', () => {
  it('aggregates file entries into summary metrics', () => {
    const files: Record<string, FileEntry> = {
      'src/a.ts': {
        path: 'src/a.ts', classification: 'source', domain: 'core',
        maintainability: 80, complexityDensity: 0.1, totalCyclomatic: 10,
        totalCognitive: 5, functionCount: 3, lines: 100, crapMax: 10,
        fanIn: 2, fanOut: 1, deadCodeRatio: 0,
        isHotspot: true, hotspotScore: 50, hotspotTrend: 'cooling',
        hasDeadExports: false, deadExportCount: 0,
        hasDuplicates: false, duplicateLineCount: 0,
        circularWith: [], dependencyDepth: 0,
        patternViolations: [{ rule: 'no-empty-catch', line: 5, message: 'test' }],
        tscErrorCount: 1,
        lineCoverage: 75, branchCoverage: 60,
        commits6mo: 10, authors6mo: 2, lastModified: '2026-04-13',
        coveredByTests: ['QA-10000'],
      },
    }

    const summary = buildSummary(files, { score: 72, grade: 'C' }, { duplication_percentage: 1.5 }, 1)
    expect(summary.healthScore).toBe(72)
    expect(summary.hotspotCount).toBe(1)
    expect(summary.patternViolationCount).toBe(1)
    expect(summary.tscErrors).toBe(1)
    expect(summary.totalCoverage).toBe(75)
    expect(summary.testsTracked).toBe(1)
  })
})
