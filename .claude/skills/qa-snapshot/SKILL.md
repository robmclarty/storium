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

2. Read the generated snapshot summary:

```bash
cat .qastate/snapshots/latest.json | npx tsx -e "
  const s = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  console.log('Health:', s.summary.healthScore + '/100 (' + s.summary.healthGrade + ')');
  console.log('Files:', s.summary.totalFiles, '| Scored:', s.summary.filesScored);
  console.log('Hotspots:', s.summary.hotspotCount);
  console.log('Dead exports:', s.summary.deadCodeExports);
  console.log('Circular deps:', s.summary.circularDeps);
  console.log('TSC errors:', s.summary.tscErrors);
  console.log('Pattern violations:', s.summary.patternViolationCount);
  console.log('Tests tracked:', s.summary.testsTracked);
  if (s.diff) console.log('Changes:', s.diff.summary);
  else console.log('First snapshot — no previous data to compare.');
"
```

3. Print the summary to the user. If `--coverage` was used, also mention coverage stats.

4. Point the user to generated reports in `.qastate/reports/` for details.
