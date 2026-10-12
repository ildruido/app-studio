# Changelog

All notable changes to the studio harness. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

## [Unreleased]

## [0.2.2] - 2026-10-12

### Changed

- `new-app` step 7 says to remove the seed page's AI status call when the app declares no AI (found by the reviewer in the Phase 5 trial).

## [0.2.1] - 2026-10-12

### Added

- `check` lists App profile placeholders (`<App name>`, `<rule>`…) that were never filled in, so a new app can't go on with a half-empty profile.

### Changed

- The artifact pack's `RELEASE.md` explains the undeclared-capability warnings on a first publish.
- The base pack's seed `style.css` now has light and dark colour tokens and an explicit body background, as the artifact page contract requires. The artifact pack's `STACK.md` states the rule. **App action:** none for existing apps (starter file; they own their CSS).

## [0.2.0] - 2026-10-12

### Added

- Stack packs in `packs/`: `base` (build, test and lint configs, platform layer with a test fake, seed page), `artifact` (single-file page published as a private Claude artifact: adapter, fake runtime for browser tests, CI workflow, release steps) and `web` (Node server with invite-only sign-in, Postgres documents and an AI endpoint, web adapter and sign-in screen, CI workflow with server job and container build, Render preview). Each pack has `STACK.md`, `RELEASE.md`, `QA.md` and `REVIEW.md` for the skills and agents, and starter files copied once into the app. See `packs/README.md`.
- `studio-sync.mjs pack add <name…> [--slug] [--title]` and `ack`: add packs (with what they require), merge their npm scripts and dev dependencies, and mark reviewed starter changes. `check` notes starter files that changed upstream, and `pull` refreshes the ones the app never edited. The lock records `packs`, `app` and `starters`.
- `scripts/packs-smoke.mjs` and a `Packs smoke` workflow that run only when a pack changes: a scratch app is built from the packs (format, lint, typecheck, unit tests, both builds, server tests).
- `core-lint` also checks that packs name no app and use only the `{{slug}}` and `{{title}}` placeholders.

### Changed

- `new-app` installs the chosen packs instead of copying files from another app. `release`, `qa` and `reviewer` read each installed pack's `RELEASE.md`, `QA.md` and `REVIEW.md`. The `CLAUDE.md` template explains packs, the build scripts (`build`, `build:artifact`, `build:web`) and starter-file ownership. `harness-sync` covers starters and adding a pack.
- The lint hook passes `--no-warn-ignored` (needs ESLint 9 or later), so editing a file the app's ESLint ignores (such as `.claude/`) no longer fails the hook.

### App action

- Apps that run ESLint or Prettier over the whole repo: ignore `.claude` in both (the packs' `eslint.config.js` and `.prettierignore` do), because the pulled harness files are not the app's code.
- Run `pull` to get the new hook script, skills and agents. Existing apps without packs need nothing else.

## [0.1.0] - 2026-10-12

### Added

- Generic core: skills `prd-intake`, `build-feature`, `test-handoff`, `release`, `new-app` and agents `planner`, `reviewer`, `qa`, rewritten from the first app's harness to read the app's **App profile** instead of naming the app.
- `harness-sync` skill and `scripts/studio-sync.mjs`: install a pinned copy of the core in an app, check it against app-studio, pull updates.
- `CLAUDE.md` template with the shared rules and the App profile (id prefix, stack, user, release and preview targets, capabilities, domain rules, stack notes), and a `settings.json` template with the hooks.
- Hook script `check.mjs`: skips lint when ESLint isn't installed and falls back to `npm test` when the app doesn't use Vitest.
- `session-usage` plugin, moved here from the project's shared files.
- `scripts/core-lint.mjs` and a small CI run that keep the core free of app and stack details.

### App action

- Existing apps: `install` adds `CLAUDE.md` and `.claude/settings.json` only when missing. Add the App profile to the app's `CLAUDE.md` by hand, add the `SessionStart` hook from the settings template, and remove any `enabledPlugins` entry for `studio@app-studio` so the skills don't load twice. Run `install` with `--force` once the app-specific lines in the old local skills have moved to the App profile.

### Removed

- The `studio-ping` spike skill.

[Unreleased]: https://github.com/ildruido/app-studio/compare/main...HEAD
