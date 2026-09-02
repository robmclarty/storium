---
name: version
description: Bump storium's version (major, minor, or patch), turn the CHANGELOG's Unreleased section into the release entry summarizing every commit since the last release, commit as vX.Y.Z, and create plus push an annotated tag. The tag triggers the publish (npm, Trusted Publishing) and release (GitHub Release) workflows, so the tag is the release.
argument-hint: "[major|minor|patch]"
disable-model-invocation: true
allowed-tools: Read, Edit, Bash(git status*), Bash(git fetch origin main*), Bash(git rev-list*), Bash(git log*), Bash(git add *), Bash(git commit *), Bash(git tag *), Bash(git push origin v*), Bash(git restore *), Bash(node -e *), Bash(node -p *), Bash(npm version *), Bash(npm test*), Bash(cat *), Bash(sed -n *)
---

# version

Bump storium's version, write the `CHANGELOG.md` entry, commit, and tag. One
package: `package.json` `version` is the source of truth (the lockfile mirrors
it in two top-level fields), the changelog lives at `CHANGELOG.md`, and releases
are tagged `vX.Y.Z`.

Pushing the tag is the release. It triggers `.github/workflows/publish.yaml`
(gate, then `npm publish --provenance` via Trusted Publishing, paused at the
`npm-publish` approval gate) and `.github/workflows/release.yaml` (GitHub
Release with the changelog section as notes). A red tag is the expensive
failure: it parks Publish at its approval gate and leaves a stray GitHub
Release, and the fix is forward-only. Verify before tagging.

The deterministic work — clean-tree check, semver math, the version rewrite —
is done with `npm version` and `git`, never by hand. The model's job is to
summarize commits into release prose and run the git steps.

## Arguments

`$ARGUMENTS` is exactly one of `major`, `minor`, or `patch`. Anything else (a
flag, nothing at all) is a usage error: tell the user the valid forms and stop.

## Steps

1. **Validate the bump type.** It must be `major`, `minor`, or `patch`. If not,
   stop with the usage message — make no changes.

2. **Require a clean tree on an up-to-date `main`.** Run `git status --porcelain`;
   if it prints anything, stop, show the dirty files, and tell the user to
   commit or stash first. Then `git fetch origin main` and
   `git rev-list --count HEAD..origin/main`; if that is not `0`, stop — the tag
   would point at a commit that a later rebase or merge could drop from `main`.
   Tell the user to pull first.

3. **Read the current version:**

   ```bash
   node -p "require('./package.json').version"
   ```

   Call this `OLD`.

4. **Find the previous release.** The marker is the newest commit whose subject
   is a bare `vX.Y.Z`:

   ```bash
   git log --grep='^v[0-9]' --format='%h %s' -1
   ```

   Its hash is `SINCE`. (Tags are the trigger, but the bump *commit* is the
   marker: storium's tags stop at `v0.9.2` while bump commits continued, so
   `git describe --tags` would reach too far back.) If no such commit exists,
   `SINCE` is empty and the whole history is the range.

5. **Collect the commit range** with `--no-merges`:

   - With `SINCE`: `git log SINCE..HEAD --no-merges --format='%h %s%n%b'`
   - Without: `git log --no-merges --format='%h %s%n%b'`

   If the range is empty, stop and tell the user there is nothing to release.
   Make no changes.

6. **Bump the version** (never do the arithmetic yourself):

   ```bash
   npm version <type> --no-git-tag-version
   ```

   This rewrites `package.json` and both top-level `version` fields in
   `package-lock.json` in one step, and prints `vNEW`. Call the number `NEW`.
   Tell the user: "Bumping version from OLD to NEW".

7. **Draft the changelog entry** in the existing format — a bare `## X.Y.Z`
   heading (no brackets, no `v`, no date), an optional one-line theme, then
   bullets:

   ```markdown
   ## X.Y.Z

   One-line theme for the release (optional — e.g. "Driver passthrough on `connect()` (PRs #3 + #4).").

   - **Bold lead** — one line per user-visible addition or change
   - Fix (scope): one line per bug fix
   - CI: tooling that affects contributors; keep short or omit
   ```

   Rules: group by impact, not by commit (collapse the commits that together
   land one feature into one bullet); one line per bullet; write for a reader
   who did not follow the work; leave out commits with no user-facing effect
   (tracker updates, branch housekeeping). `release.yaml` extracts everything
   between this heading and the next `## `, so the entry is also the GitHub
   Release notes.

   **If `CHANGELOG.md` already carries an `## Unreleased` section**, that is
   release prose someone wrote *during* the work, describing the same commits
   step 5 just collected. Do not draft alongside it and do not restate it: start
   from its bullets, keep their wording, and add only what the commit range
   covers and they miss. The section you print is the merged result.

   **Print the drafted section back to the user** as a fenced `markdown` block,
   verbatim, before editing any file. Continue automatically after printing;
   do not wait.

8. **Apply to `CHANGELOG.md`.** When the top section is `## Unreleased`, replace
   it: its heading becomes `## X.Y.Z` and its body becomes step 7's draft.
   Otherwise insert the new section immediately below the intro paragraphs and
   above the current top `## ` entry, keeping the single `# Changelog` heading
   at the very top. Leave no empty `## Unreleased` shell behind.

9. **Verify before staging:** `npm test` — typecheck, lint, build, unit. If it
   exits 0, continue. If it fails, roll back so the user can fix and re-invoke —
   `git restore package.json package-lock.json CHANGELOG.md` — show the failing
   output, and stop.

10. **Stage exactly those three files and commit.** The commit message is
    literally the tag, no body:

    ```bash
    git add package.json package-lock.json CHANGELOG.md
    git status --short
    git commit -m "vX.Y.Z"
    ```

    Confirm `git status --short` shows nothing unexpected staged before
    committing. If it does, stop and hand back to the user.

11. **Create an annotated tag and push it:**

    ```bash
    git tag -a vX.Y.Z -m "vX.Y.Z"
    git push origin vX.Y.Z
    ```

    Push only the tag (pushing `main` is the user's call). If `git tag` fails
    because the tag exists, stop — do not force. If `git push` fails (auth,
    network), the local commit and tag still exist: tell the user, show the
    error, and suggest re-running `git push origin vX.Y.Z`. Do not delete the
    tag.

12. **Report:** old version, new version, commit SHA, tag, number of commits
    summarized, whether the tag push succeeded, and two reminders: push `main`
    so the tagged commit is on the branch, and approve the paused Publish run in
    the `npm-publish` environment.

## When to use this skill

- Cutting a storium release: `/version patch`, `/version minor`, `/version major`.
- The user asks to "bump the version", "cut a release", or "tag a new version".

## When NOT to use this skill

- Nothing has changed since the last release (step 5 finds an empty range).
- The user wants to edit an existing changelog entry or retro-tag an old commit —
  that is a different, manual workflow.

## Edge cases

- **`npm test` fails in step 9.** It is not the release's fault, but it is the
  release's problem: tag over it and the recovery is forward-only. The roll-back
  leaves the tree clean; the user fixes and re-invokes.
- **An `## Unreleased` section is present.** It is folded into the new release
  section, never kept beside it (steps 7 and 8). Where its bullets and the
  commit range disagree — a bullet describing work that was later reverted, say
  — the commits win; say what you dropped when you print the draft.
- **A commit reads `BREAKING` but the user asked for `patch`.** Surface it and
  ask whether they meant `minor` (pre-1.0) before applying step 6.
- **A version bump commit already exists but is untagged** (for example a bump
  made before tagging was automated). Do not bump again: tell the user to tag
  that commit by hand (`git tag -a vX.Y.Z <sha> -m vX.Y.Z && git push origin vX.Y.Z`).
