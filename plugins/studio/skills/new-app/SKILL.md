---
name: new-app
description: Start a new app in Ale's studio - set up a fresh repo with the shared harness from app-studio, then create its PRD, backlog and first release. Use when Ale asks for a new app.
---

# New app

`app-studio` is the master copy of the harness. A new app gets a pinned copy (`.claude/studio/lock.json`) and later pulls updates with the `harness-sync` skill, so fixes flow from `app-studio` to every app.

## Steps

1. **Name it.** Agree a short kebab-case repo name with Ale (`<app>`) and a 2-3 letter id prefix. Ask Ale to create one empty private repo with that name at github.com/new (Claude can't create repos), and to start a new Claude project for the app with two repositories: `<app>` and `app-studio`. Wait for confirmation.
2. **Pick the start.** Ask Ale one product question: start as an artifact prototype (a private page in the Claude app, fastest to try), or go straight to a web app (own sign-in and hosting). Default: artifact prototype. Either way the app has a platform layer from day one, so the web build can come later without rewriting features. Once a web version exists, the artifact build stays as a prototype with smoke tests only.
3. **Clone** the empty repo next to `app-studio` and create a branch (`chore/bootstrap`, or the session branch in a cloud session).
4. **Install the harness:** `node ../app-studio/scripts/studio-sync.mjs install --app .`. It copies the skills, agents, hook script and sync script into `.claude/`, writes the lock, and adds `CLAUDE.md` and `.claude/settings.json` from the templates when they don't exist yet.
5. **Fill the App profile** in `CLAUDE.md`: app name, id prefix, stack, user, repo, release and preview targets, capabilities, domain rules, stack notes, and the product paragraph. Don't edit the copied skills or agents: anything app-specific belongs in the profile.
6. **Stack files.** Add the build config, CI workflow and release steps for the chosen stack from its stack pack in `app-studio` (until a pack exists, from an existing app on the same stack). CI must start no run for Markdown-only and `.claude/`-only changes, and skip the browser tests for a version bump.
7. **Seed the app.** Minimal entry page, `src/main.ts`, the platform module, one unit test and one browser smoke test, so CI has something real to run.
8. **Requirements.** Run `prd-intake` with Ale's description to write `docs/PRD.md` and `docs/BACKLOG.md`. Start `CHANGELOG.md` with an empty `Unreleased` section and `docs/RELEASES.md` for pending tags.
9. **Verify.** `npm install`, `npm run check`, `npm run test:e2e`, `node .claude/studio/studio-sync.mjs check`. Commit the lockfile.
10. **Merge.** Push, open a PR, wait for CI, squash-merge (`chore: bootstrap harness`).
11. **First release.** Run the `release` skill for v0.1.0; record the new release target URL in the App profile.
12. **Improve the harness.** If anything in the harness had to be fixed during setup, fix it in `app-studio` (`harness-sync` skill, part B) so the next app starts better.
13. **Tell Ale** the app link, the backlog's first Ready items, and the test script for v0.1.0.
