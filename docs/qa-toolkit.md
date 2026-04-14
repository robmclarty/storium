# QA Automation Toolkit

Claude Code skills backed by a TypeScript layer that orchestrates external analysis tools. Captures deterministic codebase health snapshots, generates reports, and provides LLM-powered analysis.

## Installation

The toolkit requires Node.js and npm. All tools are listed as devDependencies in `package.json` and installed with:

```bash
npm install
```

The QA skills and tooling live entirely within the project:

```
.claude/tools/qa/     # TypeScript modules (snapshot, registry, CLI, utils)
.claude/skills/qa-*/  # Claude Code slash commands
.health/             # Persistent state (snapshots, registry, learnings, reports)
```

No global installs are required. The CLI entry point is:

```bash
npx tsx .claude/tools/qa/cli.ts <command> [args] [flags]
```

## 3rd Party Tools

The toolkit orchestrates these external tools. All are installed as devDependencies via `npm install` — no separate installation needed.

| Tool | Package | What it does |
|------|---------|-------------|
| [fallow](https://github.com/robmclarty/fallow) | `fallow` | Health scores, complexity, hotspots, dead code, duplication |
| [ast-grep](https://ast-grep.github.io/) | `@ast-grep/cli` | Anti-pattern detection via `.ast-grep/rules/*.yml` |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | `dependency-cruiser` | Circular dependency detection |
| [vitest](https://vitest.dev/) | `vitest` + `@vitest/coverage-v8` | Test runner and coverage collection |
| [oxlint](https://oxc.rs/) | `oxlint` | Fast linting |
| [tsx](https://tsx.is/) | `tsx` | TypeScript execution (runs the QA tooling itself) |
| TypeScript | `typescript` | `tsc --noEmit` type checking |

**How npx works:** When a skill runs `npx sg scan ...` or `fallow health ...`, npm looks for the binary in the local `node_modules/.bin/` first. If the package is installed locally (via `npm install`), it runs instantly with no download. If it's not installed, npx downloads it to a temporary cache, runs it, and discards it — this is slower but works without any setup. Since all tools are in `devDependencies`, `npm install` ensures they're always local and fast.

**git** is also required (for churn and authorship stats) but is assumed to be available on any development machine.

## Skills

| Skill | Purpose | Needs snapshot? |
|-------|---------|----------------|
| `/qa-snapshot` | Run full analysis pipeline, save snapshot | No (creates one) |
| `/qa-health` | Quick health score via fallow | No |
| `/qa-analyze` | QA department report with trends and recommendations | Yes |
| `/qa-review` | Developer self-review of recent changes | No (uses scoped tools) |
| `/qa-fragile` | Rank files by fragility score | Yes |
| `/qa-trace` | Trace test-to-source or source-to-test dependencies | Yes |
| `/qa-make-tests` | Generate missing unit tests for a file | Yes |
| `/qa-test-id` | Manage QA-10000+ test ID registry | No |

## CLI

The QA CLI provides direct access to data queries that skills use internally. Useful for scripting, debugging, or quick lookups without invoking a skill.

```bash
# Trace a test or source file
npx tsx .claude/tools/qa/cli.ts trace QA-10386
npx tsx .claude/tools/qa/cli.ts trace src/core/prep.ts

# List tests (with filters)
npx tsx .claude/tools/qa/cli.ts tests list --status active --type unit

# Find source files with no covering tests
npx tsx .claude/tools/qa/cli.ts tests coverage-gaps --domain core

# Verify test registry integrity
npx tsx .claude/tools/qa/cli.ts verify

# Show snapshot summary
npx tsx .claude/tools/qa/cli.ts snapshot show
npx tsx .claude/tools/qa/cli.ts snapshot diff

# JSON output (any command)
npx tsx .claude/tools/qa/cli.ts trace QA-10386 --json
```

### Learnings Management

```bash
npx tsx .claude/tools/qa/cli.ts learnings list [--category C] [--confidence L]
npx tsx .claude/tools/qa/cli.ts learnings add --category <C> --insight "<text>" [--confidence L] [--context "<text>"]
npx tsx .claude/tools/qa/cli.ts learnings confirm <ID> [--confidence L] [--context "<text>"]
npx tsx .claude/tools/qa/cli.ts learnings update <ID> [--insight T] [--category C] [--confidence L] [--context T]
npx tsx .claude/tools/qa/cli.ts learnings supersede <ID> --insight "<text>" [--category C]
npx tsx .claude/tools/qa/cli.ts learnings remove <ID>
npx tsx .claude/tools/qa/cli.ts learnings merge <ID1> <ID2> [...] --insight "<text>" [--category C]
```

## Data Files

All persistent state lives in `.health/`:

| File | Committed | Purpose |
|------|-----------|---------|
| `config.json` | Yes | Tool paths, score thresholds, domain weights |
| `learnings.json` | Yes | Accumulated insights from `/qa-analyze` |
| `test-registry.json` | Yes | QA-10000+ test ID mappings |
| `snapshots/` | No (.gitignored) | Regenerable snapshot JSON |
| `reports/` | No (.gitignored) | Regenerable markdown reports |

## Typical Workflows

**Weekly QA review:**
```
/qa-snapshot
/qa-analyze
/qa-fragile --top 10
```

**Before pushing:**
```
/qa-review --staged
/qa-health --trend
```

**Improving test coverage:**
```
/qa-fragile --domain core
/qa-make-tests src/core/prep.ts
/qa-test-id verify
```

**Investigating a file:**
```
/qa-trace src/core/createRepository.ts
/qa-trace QA-10042
```
