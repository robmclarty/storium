---
name: qa-snapshot
description: Run the full QA tool pipeline to capture a deterministic codebase health snapshot. Use this to collect metrics from fallow, knip, dependency-cruiser, ast-grep, tsc, and git. No LLM analysis — just data collection and templated reports.
disable-model-invocation: true
---

# /qa-snapshot

Capture a deterministic codebase health snapshot. Runs all external analysis tools, merges their outputs, diffs against the previous snapshot, and generates templated markdown reports.

**Arguments:** `[--coverage] [--force]`

- `--coverage`: Also run vitest with coverage (slower)
- `--force`: Re-run even if a recent snapshot exists

## Steps

1. Run the snapshot pipeline:

```bash
npx tsx .claude/tools/qa/snapshot.ts $ARGUMENTS
```

2. Show the snapshot summary:

```bash
npx tsx .claude/tools/qa/cli.ts snapshot show
```

3. Print the summary to the user. If `--coverage` was used, also mention coverage stats.

4. Point the user to generated reports in `.health/reports/` for details.
