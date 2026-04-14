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
