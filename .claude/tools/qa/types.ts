// --- Snapshot types ---

export type FileClassification = 'source' | 'test' | 'config' | 'script' | 'fixture' | 'docs'

export type PatternViolation = {
  rule: string       // e.g. 'no-empty-catch', 'no-as-any'
  line: number
  message: string
}

export type FileEntry = {
  path: string
  classification: FileClassification
  domain: string | null

  // From fallow health --file-scores
  maintainability: number | null    // 0-100 maintainability index
  complexityDensity: number | null  // cyclomatic / lines
  totalCyclomatic: number | null
  totalCognitive: number | null
  functionCount: number | null
  lines: number | null
  crapMax: number | null
  fanIn: number | null
  fanOut: number | null
  deadCodeRatio: number | null

  // From fallow health --hotspots
  isHotspot: boolean
  hotspotScore: number | null
  hotspotTrend: 'heating' | 'cooling' | 'stable' | null

  // From fallow dead-code
  hasDeadExports: boolean
  deadExportCount: number

  // From fallow dupes
  hasDuplicates: boolean
  duplicateLineCount: number

  // From dependency-cruiser
  circularWith: string[]
  dependencyDepth: number

  // From ast-grep
  patternViolations: PatternViolation[]

  // From tsc
  tscErrorCount: number

  // From vitest coverage (when available)
  lineCoverage: number | null
  branchCoverage: number | null

  // From git
  commits6mo: number
  authors6mo: number
  lastModified: string

  // From test registry
  coveredByTests: string[]   // QA-NNNNN IDs
}

export type SnapshotSummary = {
  healthScore: number | null       // from fallow --score (0-100)
  healthGrade: string | null       // A-F
  totalFiles: number
  filesScored: number
  avgMaintainability: number | null
  totalCoverage: number | null     // aggregate line coverage %
  deadCodeFiles: number
  deadCodeExports: number
  duplicationPercent: number
  circularDeps: number
  tscErrors: number
  hotspotCount: number
  patternViolationCount: number
  testsTracked: number             // from test registry
}

export type SnapshotDiff = {
  improved: string[]               // files with better scores
  regressed: string[]              // files with worse scores
  added: string[]                  // new files
  removed: string[]                // deleted files
  summary: string                  // one-line human-readable
}

export type Snapshot = {
  timestamp: string
  command: string                  // which skill triggered this
  summary: SnapshotSummary
  files: Record<string, FileEntry>
  diff: SnapshotDiff | null        // null on first run
}

// --- Learnings types ---

export type LearningConfidence = 'low' | 'medium' | 'high'

export type Learning = {
  id: string
  domain: string                   // 'coverage' | 'fragility' | 'testing' | 'architecture' | 'tooling'
  insight: string
  confidence: LearningConfidence
  source: string                   // which skill: 'qa-analyze', 'qa-make-tests', etc.
  context: {
    files?: string[]
    metrics?: Record<string, number>
  }
  firstSeen: string
  lastConfirmed: string
  supersedes?: string              // id of learning this one replaced
}

export type LearningsFile = {
  version: 1
  entries: Learning[]
}

// --- Test Registry types ---

export type TestType = 'unit' | 'integration' | 'e2e'
export type TestStatus = 'active' | 'disabled' | 'missing' | 'stale'

export type TestRegistryEntry = {
  id: string                       // QA-10000, QA-10001, ...
  name: string                     // test description string
  suite: string                    // describe block or file-level suite name
  file: string                     // path to test file
  line: number                     // line number in file
  type: TestType
  status: TestStatus
  coveredFiles: string[]
  coveredFunctions: string[]
  lastVerified: string
  lastPassed: string | null
  createdAt: string
}

export type TestRegistry = {
  version: 1
  nextId: number
  entries: TestRegistryEntry[]
}

// --- Config types ---

export type QAConfig = {
  version: 1
  tools: Record<string, string>
  thresholds: {
    hotspotScore: number
    lowCoverage: number
    highComplexity: number
  }
  domainWeights: Record<string, number>
}
