---
name: qa-make-tests
description: Generate unit tests for uncovered functions in a source file. Reads the file, identifies gaps, generates tests following project conventions, and assigns QA test IDs.
disable-model-invocation: true
---

# /qa-make-tests

Generate missing unit tests for a source file.

**Arguments:** `<file-path>`

## Steps

1. Read the target file:

```bash
cat <file-path>
```

1. Check for existing test coverage and metrics:

```bash
pnpm exec tsx .claude/tools/qa/cli.ts trace <file-path>
```

1. Run fallow on the specific file for current complexity data:

```bash
fallow health --file-scores --format json --quiet
```

Filter to the target file's entry.

1. Identify uncovered functions:
   - From coverage data: functions with 0% coverage
   - From code analysis: exported functions not referenced in any test file
   - Prioritize by complexity (more complex = more important to test)

2. Generate unit tests following these conventions:
   - Use vitest (`import { describe, it, expect } from 'vitest'`)
   - Match the project's existing test file naming: `__tests__/<name>.test.ts`
   - Each test gets a QA ID in the name: `it('[QA-NNNNN] description', ...)`
   - Test the public interface, not implementation details
   - Include edge cases for complex functions

3. Assign test IDs by calling the registry:

```bash
pnpm exec tsx -e "
  import { assignNextId } from './.claude/tools/qa/registry.js';
  const id = assignNextId('.health/test-registry.json', {
    name: '<test-name>',
    suite: '<suite-name>',
    file: '<test-file-path>',
    line: <line-number>,
    type: 'unit',
    coveredFiles: ['<source-file>'],
    coveredFunctions: ['<function-name>'],
  });
  console.log(id);
"
```

1. Write the test file. Do NOT overwrite existing tests — append or create a new file.

2. Run the new tests to verify they pass:

```bash
pnpm exec vitest run <test-file-path>
```

1. Print a summary: how many tests generated, which functions covered, test IDs assigned.
