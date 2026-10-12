---
name: harness-sync
description: Keep an app's copy of the studio harness in step with app-studio - pull updates into the app, or ship a harness fix to app-studio first. Use when a session warns the harness is behind or edited, when Ale asks to update the harness, or when a skill, agent or hook needs a fix.
---

# Harness sync

`app-studio` holds the master copy of the shared skills, agents and hook script. Each app carries a copy pinned in `.claude/studio/lock.json` (studio version plus a hash per file). `.claude/studio/studio-sync.mjs` compares the two; it looks for `app-studio` in `--studio <dir>`, then `$STUDIO_DIR`, then a sibling `../app-studio` checkout.

## Part A: pull updates into an app

1. `git -C ../app-studio pull` so the master copy is current.
2. `node .claude/studio/studio-sync.mjs check`. It lists files that are **behind** (changed in `app-studio`), **edited** (changed here since the last sync) and **missing**.
3. An **edited** file is a local fix that never reached `app-studio`. Move it there first (part B), or drop it if it was app-specific and belongs in the App profile instead.
4. `node .claude/studio/studio-sync.mjs pull`. It updates the managed files and the lock, and refuses to overwrite an edited file unless you pass `--force`.
5. Read `app-studio`'s `CHANGELOG.md` for the versions you skipped. Apply any step it marks **App action** (for example a new App profile field or a settings change).
6. Commit `chore(harness): sync studio vX.Y.Z` and merge it via a PR. Only `.claude/` changed, so CI needs no run.

## Part B: fix the harness itself

1. Make the change in `app-studio` on its own branch (the session branch in a cloud session). Keep the core generic: app facts go in an App profile, stack facts in a stack pack. `node scripts/core-lint.mjs` must pass.
2. Bump `version` in `plugins/studio/.claude-plugin/plugin.json` (PATCH for wording and fixes, MINOR for a new skill, agent or profile field) and add a `CHANGELOG.md` entry. Mark anything an app must do by hand as **App action**.
3. Run `node --test scripts/studio-sync.test.mjs`, open a PR, merge it when CI is green.
4. Pull it into the app that needed it (part A). Other apps pick it up at their next sync.
