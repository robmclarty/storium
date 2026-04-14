---
name: qa-review
description: Developer self-review of recent changes before committing or opening a PR. Runs scoped analysis on changed files only — fast, specific, not exhaustive. Local only, does not post to PRs.
disable-model-invocation: true
---

# /qa-review

Fast, focused review of your recent changes. Tells you specifically what's wrong with your diff — not the whole codebase.

**Audience:** Individual developer, reviewing their own work before pushing.

**Arguments:** `[--base <ref>] [--file <path>] [--staged]`

- `--staged`: Review only staged changes
- `--base <ref>`: Review changes since a ref (default: `main`)
- `--file <path>`: Review a specific file's current state

## Steps

1. Determine the diff scope:

If `--staged`:
```bash
git diff --cached --name-only
```

If `--base <ref>` (or default `main`):
```bash
git diff --name-only <ref>...HEAD
```

If `--file <path>`: use that single file.

2. Run scoped analysis on changed files only:

```bash
# Complexity and dead code on changed files
fallow audit --base <ref> --format json --quiet

# Anti-pattern check on changed files
npx sg scan <space-separated changed files> --json 2>/dev/null

# Check if changes created new circular deps
npx depcruise --output-type json --no-config --ts-pre-compilation-deps --reaches <changed-files> src/ 2>/dev/null
```

3. Read `.qastate/snapshots/latest.json` for baseline context (if it exists). For each changed file, note:
   - Was it already a hotspot?
   - What was its maintainability score before?
   - Did it have existing pattern violations?
   - What was its coverage?

4. Read `.qastate/learnings.json` for domain-specific gotchas relevant to the changed files.

5. Read the actual diff:

```bash
git diff <ref>...HEAD -- <changed-files>
```

Or for `--staged`: `git diff --cached -- <changed-files>`

6. Produce a review with these sections:

   **Verdict:** `pass` | `needs-attention` | `problems-found`

   **Issues You Introduced:** Specific, actionable, tied to exact lines. These are new problems in the diff.

   **Pre-existing Issues You Touched:** Flagged separately. "This `catch(e) {}` was already here, but since you're in this file, consider fixing it."

   **Context Warnings:** "You're modifying src/connect.ts which is the #1 hotspot. Your changes add complexity to an already-complex function."

   **Missing Tests:** "You added a new exported function but no test covers it."

   **Positive Feedback:** "Good: you removed unused imports that fallow had flagged."

7. Print the review to the terminal.

## What This Skill Does NOT Do

- Post comments to PRs
- Generate reports or dashboards
- Update learnings (that's `/qa-analyze`'s job)
- Analyze the whole codebase (only the diff)
- Block the developer from committing (advisory only)
