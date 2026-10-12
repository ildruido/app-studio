---
name: release
description: Cut a SemVer release from a green main - bump version, update CHANGELOG, tag, build and ship to the app's release target. Use when work under Unreleased should reach Ale.
---

# Release

Never release from a branch or a red `main`. The build and ship steps depend on the stack: they come from the **stack notes** in `CLAUDE.md`'s App profile.

## Steps

1. **Preconditions.** `git switch main && git pull`. Working tree clean. Latest CI run on `main` is green. CI on `main` runs only the quick checks after a merge (the PR ran the full suite), so start the full suite on `main` before releasing: run `CI` with `workflow_dispatch` (Actions > CI > Run workflow, or the `actions_run_trigger` tool) and wait for it to pass. Skip this if the last code change on `main` already had a manual full run. `CHANGELOG.md` has entries under `## [Unreleased]`. If not, stop and say why.
2. **Pick the version** from the commits since the last release (`git log <last tag or release commit>..HEAD --oneline`):
   - Below 1.0.0: any `feat` or breaking change → bump MINOR; only `fix`/`perf` → bump PATCH.
   - From 1.0.0: breaking → MAJOR, `feat` → MINOR, otherwise PATCH.
   - `docs`/`chore`/`ci`/`test` only → no release; tell Ale nothing user-facing changed.
3. **Release branch.** `git switch -c chore/release-vX.Y.Z` (the session branch in a cloud session).
4. **Bump.** `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and the lockfile).
5. **Changelog.** Move the `Unreleased` entries under `## [X.Y.Z] - YYYY-MM-DD`, leave an empty `## [Unreleased]`, update the compare links at the bottom.
6. **Verify.** `npm run check` passes. No local e2e: only the version and notes changed, and `main` passed the full suite in step 1. CI sees a version-only change and skips the browser tests too.
7. **Commit and merge.** `git commit -am "chore(release): vX.Y.Z"`, push, open a PR, wait for CI, squash-merge.
8. **Tag main.** `git switch main && git pull`, then `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`. Never move or delete an existing tag. In a cloud session the tag push is refused: record it in `docs/RELEASES.md` with the commit and carry on.
9. **Build and ship** from the tagged commit, following the stack notes' **Release** steps exactly (build command, size limits, where it is published, which link must stay the same). If the release adds or removes a capability, ship the new set and say so in step 11.
10. **Preview target too,** if the App profile has one and the stack notes say to refresh it on release. Never send Ale a script for the preview before it is refreshed, and give both links.
11. **Tell Ale** in plain words what changed for the user, the link, the version shown in the app, and any new consent prompt or manual step. Then run `test-handoff` (or hold the script if Ale tests in batches).
