---
name: qa-trace
description: Trace the relationship between tests and source files. Given a test ID or file path, show what it covers and what covers it. Read-only — no data changes.
disable-model-invocation: true
---

# /qa-trace

Map tests to the files they cover, or files to the tests that cover them.

**Arguments:** `<test-id-or-file-path>`

## Steps

1. Run the trace CLI:

```bash
pnpm exec tsx .claude/tools/qa/cli.ts trace $ARGUMENTS
```

1. Review the output:
   - For a **test ID** (`QA-NNNNN`): shows test metadata, covered source files with metrics, and sibling tests covering the same files.
   - For a **source file**: shows file metrics from the latest snapshot and all tests that cover it.

2. Identify coverage gaps — which functions or areas have no covering tests.

3. If new tracing insights are found, record them via CLI:
   `pnpm exec tsx .claude/tools/qa/cli.ts learnings add --category observation --insight "<text>"`

4. Print results to terminal.
