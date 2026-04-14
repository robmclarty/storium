---
name: qa-health
description: Quick codebase health check. Runs fallow health score and prints key metrics. No LLM analysis, fast, no snapshot required.
disable-model-invocation: true
---

# /qa-health

Quick health check — runs `fallow --score` and prints the letter grade and key metrics. Use for fast "how are we doing?" checks without running the full snapshot pipeline.

**Arguments:** `[--trend]`

- `--trend`: Compare against the most recent snapshot

## Steps

1. Run fallow health score:

```bash
fallow --format json --quiet --score
```

2. Parse the JSON output and extract:
   - `health_score.score` (0-100)
   - `health_score.grade` (A-F)
   - `vital_signs.dead_file_pct`
   - `vital_signs.dead_export_pct`
   - `vital_signs.avg_cyclomatic`
   - `vital_signs.circular_dep_count`
   - `vital_signs.maintainability_avg`
   - `check.summary` (issue counts)
   - `dupes.stats` (duplication percentage)

3. Print a concise summary:

```
Health Score: {score}/100 ({grade})
Maintainability: {maintainability_avg}
Dead code: {dead_export_pct}% exports, {dead_file_pct}% files
Duplication: {duplication_percentage}%
Circular deps: {circular_dep_count}
Avg cyclomatic: {avg_cyclomatic}
```

4. If `--trend` was passed, show the previous snapshot for comparison:

```bash
npx tsx .claude/tools/qa/cli.ts snapshot show
```

Compare key metrics and show deltas with arrows (up/down).

5. If `--trend` was passed but no snapshot exists, tell the user to run `/qa-snapshot` first to enable trending.
