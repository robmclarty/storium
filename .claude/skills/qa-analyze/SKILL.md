---
name: qa-analyze
description: Generate comprehensive QA department reports from snapshot data. Produces trend narratives, risk assessments, and strategic recommendations for QA leads and engineering managers. Requires a snapshot — run /qa-snapshot first.
disable-model-invocation: true
---

# /qa-analyze

Generate a comprehensive QA analysis report from snapshot data. This is what the QA lead reads weekly — trend narratives, risk assessments, strategic recommendations, cross-domain patterns.

**Audience:** QA lead, engineering manager, team leads. Not individual developers.

**Arguments:** `[--focus <domain>] [--depth shallow|deep]`

## Prerequisites

Ensure `.health/snapshots/latest.json` exists. If not, tell the user:
> Run `/qa-snapshot` first to collect codebase metrics.

## Steps

1. Read the current snapshot summary:

```bash
npx tsx .claude/tools/qa/cli.ts snapshot show
```

2. Compare against the previous snapshot:

```bash
npx tsx .claude/tools/qa/cli.ts snapshot diff
```

3. Read accumulated learnings:

```bash
npx tsx .claude/tools/qa/cli.ts learnings list
```

4. For deeper context, read the full snapshot JSON:

```bash
cat .health/snapshots/latest.json
```

5. Produce a structured analysis covering:

   **Health Trend:** Is the codebase getting better or worse? Which domains are improving, which are regressing? Use snapshot diffs and historical comparisons.

   **Risk Assessment:** Which areas have the highest probability of causing production incidents? Look for the combination of: high churn (hotspots), high complexity, low coverage, recent regressions, pattern violations.

   **Strategic Recommendations:** Concrete, actionable recommendations with specific file paths and rationale. Example: "The auth domain has accumulated 4 hotspot files over the last 3 snapshots. Recommend allocating a sprint to refactor auth/session-manager.ts before the next feature push."

   **Cross-Domain Patterns:** Duplication across domains, recurring anti-patterns (from ast-grep), architectural boundary violations.

   **Progress Tracking:** What improved since the last analysis? Was a previous recommendation addressed?

6. If `--focus <domain>` was passed, narrow the analysis to files in that domain only.

7. Update learnings using CLI commands. For each insight discovered:
   - New insight, nothing similar:
     `npx tsx .claude/tools/qa/cli.ts learnings add --category <C> --insight "<text>" [--context "<text>"]`
   - Confirms existing:
     `npx tsx .claude/tools/qa/cli.ts learnings confirm <ID> [--confidence <level>] [--context "<text>"]`
   - Contradicts existing:
     `npx tsx .claude/tools/qa/cli.ts learnings supersede <ID> --insight "<text>" [--category <C>]`
   - Refines existing:
     `npx tsx .claude/tools/qa/cli.ts learnings update <ID> --insight "<text>" [--context "<text>"]`
   - Compact related learnings:
     `npx tsx .claude/tools/qa/cli.ts learnings merge <ID1> <ID2> --insight "<text>"`

8. Print the full report to the terminal.

9. Write the full analysis report to `.health/reports/analysis.md`.

## Output Tone

Professional, data-driven, suitable for a team standup or sprint retrospective. Not a wall of metrics — a narrative with supporting data. Lead with the most important finding.
