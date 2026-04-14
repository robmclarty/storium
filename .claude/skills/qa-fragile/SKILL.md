---
name: qa-fragile
description: Identify the most fragile areas of the codebase — high churn, high complexity, low coverage files that are most likely to cause problems. Requires a snapshot.
disable-model-invocation: true
---

# /qa-fragile

Find the most fragile files in the codebase. Fragility = high churn × high complexity ÷ low coverage. These are the files most likely to break in production.

**Arguments:** `[--top N] [--domain <name>]`

- `--top N`: Show top N files (default: 20)
- `--domain <name>`: Filter to a specific domain

## Prerequisites

Ensure `.qastate/snapshots/latest.json` exists. If not:
> Run `/qa-snapshot` first to collect codebase metrics.

## Steps

1. Read the snapshot:

```bash
cat .qastate/snapshots/latest.json
```

2. Filter to source files. If `--domain` is set, filter to that domain.

3. Sort files by fragility score (deterministic — no LLM):

```
fragilityScore = commits6mo * (complexityDensity || 0.01) / ((lineCoverage || 1) / 100)
```

Also boost files that are hotspots (fallow's `isHotspot` flag) or have pattern violations.

4. Take the top N (default 20).

5. For each file, provide LLM analysis:
   - **Why it's fragile:** Explain the specific combination of factors
   - **What the risk is:** What could go wrong if this file breaks
   - **Concrete fix plan:** Specific refactoring steps, what tests to add, what to split

6. Read `.qastate/learnings.json` and update with any new fragility-related insights.

7. Print the ranked list with narratives to the terminal.
