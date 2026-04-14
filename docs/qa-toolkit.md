# QA Automation Toolkit

A set of Claude Code skills backed by a thin TypeScript layer that orchestrates external analysis tools. The toolkit captures deterministic codebase health snapshots, generates reports, and provides LLM-powered analysis — all without reimplementing what existing tools already do well.

## Architecture

```
Skills (Claude Code slash commands)
  │
  ├─ /qa-snapshot    ── runs ──▶  snapshot.ts  ──▶  .qastate/snapshots/latest.json
  ├─ /qa-health      ── runs ──▶  fallow --score  (direct, no snapshot needed)
  ├─ /qa-analyze     ── reads ─▶  snapshot JSON + learnings.json
  ├─ /qa-review      ── runs ──▶  fallow audit + ast-grep + depcruise (scoped to diff)
  ├─ /qa-fragile     ── reads ─▶  snapshot JSON
  ├─ /qa-trace       ── reads ─▶  snapshot JSON + test-registry.json
  ├─ /qa-make-tests  ── reads ─▶  snapshot + source file → generates tests
  └─ /qa-test-id     ── reads/writes ▶  test-registry.json
```

**External tools** do all deterministic analysis: [fallow](https://github.com/robmclarty/fallow) (health scores, complexity, hotspots, dead code, duplication), knip (unused exports), dependency-cruiser (circular deps), ast-grep (anti-patterns), tsc (type errors), vitest (coverage), git (churn stats).

**Skills** orchestrate the pipeline and apply LLM judgment only where tools can't — interpreting trends, generating recommendations, writing tests, reviewing diffs.

## Quick Start

```bash
# Capture a snapshot (runs all tools, ~30 seconds)
/qa-snapshot

# Quick health check (just fallow, ~5 seconds)
/qa-health

# Review your uncommitted changes
/qa-review --staged

# Find the most fragile files
/qa-fragile --top 10

# Generate tests for a file
/qa-make-tests src/core/createRepository.ts
```

## Skills Reference

### /qa-snapshot

Run the full analysis pipeline. Shells out to fallow, knip, dependency-cruiser, ast-grep, tsc, and git in sequence. Merges all JSON outputs into a unified per-file snapshot, diffs against the previous snapshot, and generates templated markdown reports.

**Arguments:** `[--coverage] [--force]`

- `--coverage` — also run vitest with coverage collection (slower)
- `--force` — re-run even if a recent snapshot exists

**Outputs:**
- `.qastate/snapshots/latest.json` — full snapshot with per-file metrics
- `.qastate/snapshots/history/<timestamp>.json` — timestamped archive
- `.qastate/reports/health.md` — health overview
- `.qastate/reports/hotspots.md` — high-churn files
- `.qastate/reports/coverage.md` — low-coverage files
- `.qastate/reports/changelog.md` — what changed since last snapshot

### /qa-health

Fast health check — runs `fallow --score` and prints key metrics. No snapshot required, no LLM analysis. Use for quick "how are we doing?" checks.

**Arguments:** `[--trend]`

- `--trend` — compare against the most recent snapshot and show deltas

### /qa-analyze

QA department reports with trend narratives, risk assessments, and strategic recommendations. Reads snapshot data and accumulated learnings. Audience: QA lead, engineering manager, team leads.

**Arguments:** `[--focus <domain>] [--depth shallow|deep]`

**Prerequisite:** Run `/qa-snapshot` first.

Updates `.qastate/learnings.json` with new strategic insights discovered during analysis.

### /qa-review

Developer self-review of recent changes. Runs scoped analysis on changed files only — fallow audit, ast-grep scan, dependency-cruiser reach check. Compares against baseline snapshot to distinguish new issues from pre-existing ones.

**Arguments:** `[--base <ref>] [--file <path>] [--staged]`

- `--staged` — review only staged changes
- `--base <ref>` — review changes since a ref (default: `main`)
- `--file <path>` — review a single file

Produces a verdict: `pass`, `needs-attention`, or `problems-found`.

### /qa-fragile

Identify the most fragile areas of the codebase. Ranks files by a deterministic fragility score:

```
fragilityScore = commits6mo × complexityDensity / (lineCoverage / 100)
```

Boosted for hotspots and pattern violations. For each file, the LLM explains why it's fragile, what the risk is, and provides a concrete fix plan.

**Arguments:** `[--top N] [--domain <name>]`

**Prerequisite:** Run `/qa-snapshot` first.

### /qa-trace

Trace the relationship between tests and source files. Given a test ID, shows what source files it covers. Given a source file, shows what tests cover it and identifies gaps.

**Arguments:** `<test-id-or-file-path>`

- `QA-10042` — look up test metadata and covered files
- `src/core/prep.ts` — look up covering tests and coverage gaps

### /qa-make-tests

Generate missing unit tests for a source file. Reads the file, checks snapshot coverage data, identifies uncovered functions (prioritized by complexity), and generates vitest tests following project conventions. Each test gets a QA-NNNNN ID.

**Arguments:** `<file-path>`

### /qa-test-id

Manage the QA test ID registry (QA-10000+).

**Subcommands:**

- `assign` — scan all test files, find tests without `/* QA-NNNNN */` annotations, assign sequential IDs
- `lookup <QA-NNNNN>` — show test metadata (name, file, line, status, covered files)
- `verify` — walk the registry and check each test still exists at its recorded path

## Data Files

All persistent state lives in `.qastate/`:

| File | Committed | Purpose |
|------|-----------|---------|
| `config.json` | Yes | Tool paths, score thresholds, domain weights |
| `learnings.json` | Yes | Accumulated cross-run insights from `/qa-analyze` |
| `test-registry.json` | Yes | QA-10000+ test ID mappings |
| `snapshots/` | No (.gitignored) | Regenerable snapshot JSON files |
| `reports/` | No (.gitignored) | Regenerable markdown reports |

### config.json

Controls tool behavior without code changes:

- **tools** — command strings for each external tool (override if tools are installed differently)
- **thresholds** — `hotspotScore` (default 30), `lowCoverage` (default 50%), `highComplexity` (default 25)
- **domainWeights** — maps path segments to priority scores (0-100). `auth: 95` means auth-related files get higher priority in fragility rankings and risk assessments. `test: 5` means test files get low priority.

### learnings.json

Accumulated insights from `/qa-analyze` runs. Each learning has a `confidence` level (`low` → `medium` → `high`) that increases as the same pattern is confirmed across snapshots. Merge rules:

- New insight → append with `confidence: 'low'`
- Confirms existing → update `lastConfirmed`, bump confidence
- Contradicts existing → add new with `supersedes` pointing to old

### test-registry.json

Maps QA-NNNNN IDs to test metadata. IDs start at QA-10000 and increment. Each entry records the test name, file, line, type (unit/integration/e2e), status (active/missing/stale), and which source files and functions it covers.

## ast-grep Rules

Two starter rules in `.ast-grep/rules/`:

- **no-empty-catch** — flags `catch {}` blocks that swallow errors silently
- **no-as-any** — flags `expr as any` type assertions that bypass type safety

Add new rules as `.yml` files in the same directory. They're automatically picked up by `sg scan`.

## TypeScript API

The toolkit code lives in `.claude/tools/qa/` and can be used programmatically:

```typescript
// Run the full pipeline
import { runSnapshot } from './.claude/tools/qa/snapshot.js'
const snapshot = await runSnapshot({ coverage: true })

// Test registry operations
import { assignNextId, lookupTest, verifyRegistry } from './.claude/tools/qa/registry.js'
const id = assignNextId('.qastate/test-registry.json', {
  name: 'should validate email', suite: 'UserService',
  file: 'src/users/__tests__/user.test.ts', line: 42,
  type: 'unit',
  coveredFiles: ['src/users/user.service.ts'],
  coveredFunctions: ['validateEmail'],
})

// Or run via CLI
// npx tsx .claude/tools/qa/snapshot.ts [--coverage] [--force]
```

## Typical Workflows

**Weekly QA review:**
```
/qa-snapshot           # capture current state
/qa-analyze            # generate QA department report
/qa-fragile --top 10   # identify riskiest files
```

**Before pushing a feature branch:**
```
/qa-review --staged    # check your changes
/qa-health --trend     # quick score check with delta
```

**Improving test coverage:**
```
/qa-fragile --domain core     # find untested critical files
/qa-make-tests src/core/prep.ts   # generate missing tests
/qa-test-id verify            # check registry integrity
```

**Investigating a file:**
```
/qa-trace src/core/createRepository.ts   # what tests cover this?
/qa-trace QA-10042                       # what does this test cover?
```
