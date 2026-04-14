---
name: qa-test-id
description: Manage the QA test ID registry. Assign IDs to un-annotated tests, look up test metadata by ID, or verify all registered tests still exist. Subcommands: assign, lookup, verify.
disable-model-invocation: true
---

# /qa-test-id

Manage the QA-10000+ test ID registry.

**Arguments:** `assign | lookup <QA-NNNNN> | verify`

## Subcommands

### assign

Scan all test files, find tests without `/* QA-NNNNN */` annotations, assign the next sequential ID, add the comment and name prefix, and update the registry.

1. Glob for test files:

```bash
find . -path '*/node_modules' -prune -o -name '*.test.ts' -print -o -name '*.spec.ts' -print
```

2. For each test file, parse `it()` and `test()` blocks. Find any without a `/* QA-NNNNN */` comment on the same line or the line above.

3. For each un-annotated test:
   - Assign the next ID from the registry
   - Add `/* QA-NNNNN */` before the `it()`/`test()` call
   - Prefix the test name: `'[QA-NNNNN] original name'`
   - Update `.qastate/test-registry.json`

4. Print how many tests were assigned IDs.

### lookup <QA-NNNNN>

1. Read `.qastate/test-registry.json`
2. Find the entry with matching ID
3. Print full metadata: name, suite, file, line, type, status, covered files, dates

### verify

Walk the registry and verify each test:

1. Run the registry verifier:

```bash
npx tsx -e "
  const { verifyRegistry } = require('./.claude/tools/qa/registry.js');
  const report = verifyRegistry('.qastate/test-registry.json');
  console.log(JSON.stringify(report, null, 2));
"
```

2. Print the report: how many active, missing, stale tests found.

3. For missing tests, suggest whether to remove from registry or investigate.
