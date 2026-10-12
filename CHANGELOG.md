# Changelog

All notable changes to the studio harness. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

## [Unreleased]

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
