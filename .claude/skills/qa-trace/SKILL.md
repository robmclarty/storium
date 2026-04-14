---
name: qa-trace
description: Trace the relationship between tests and source files. Given a test ID or file path, show what it covers and what covers it. Read-only — no data changes.
disable-model-invocation: true
---

# /qa-trace

Map tests to the files they cover, or files to the tests that cover them.

**Arguments:** `<test-id-or-file-path>`

## Steps

1. Read both data sources:

```bash
cat .qastate/snapshots/latest.json
cat .qastate/test-registry.json
```

2. Determine the argument type:
   - If it matches `QA-\d+`: it's a test ID → look up `coveredFiles` from the registry
   - Otherwise: it's a file path → look up `coveredByTests` from the snapshot

3. For a **test ID**:
   - Show the test metadata (name, suite, file, line, type, status)
   - List all source files it covers
   - For each covered file, show its maintainability score and coverage

4. For a **source file**:
   - Show the file's metrics from the snapshot
   - List all tests that cover it (from `coveredByTests`)
   - For each test, show its metadata from the registry
   - Identify coverage gaps: which functions/areas have no covering tests

5. Present the dependency chain and highlight gaps.

6. Read `.qastate/learnings.json` and update if new tracing insights are found.

7. Print results to terminal.
