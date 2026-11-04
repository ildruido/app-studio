# Changelog

All notable changes to the studio harness. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

## [Unreleased]

## [0.3.0] - 2026-11-04

### Added

- **Release tags made by CI** (base pack 0.3.0): a `Release tag` workflow (`.github/workflows/release-tag.yml`) tags each release commit `vX.Y.Z` and creates the GitHub release from the changelog section when the release PR merges. Cloud sessions can't push tags, so Ale no longer has to. `release` skill steps 8 and 11 and the template's "Roles" and "Cloud sessions" sections follow; `docs/RELEASES.md` is only for apps without the workflow. Origin: chess-coach, where Ale pushed pending tags by hand. **App action:** copy `packs/base/starter/.github/workflows/release-tag.yml` into the app (apps own their workflows), then update "Roles" and "Cloud sessions" in `CLAUDE.md` from the template. A tag that is still pending is pushed once by hand, or created by running the workflow (Actions > Release tag > Run workflow) on the release commit.
- **Deploy on release** (web pack 0.2.0): `.github/workflows/deploy.yml` calls the Render deploy hook when a release lands on `main`; ordinary merges still don't deploy. `RELEASE.md`, `STACK.md` and `docs/PREVIEW.md` no longer start test scripts with a manual deploy. Origin: chess-coach CC-064. **App action (web apps):** copy the workflow, and Ale adds the `RENDER_DEPLOY_HOOK` repository secret (`docs/PREVIEW.md`, set-up step 3).
- **`mirror` pack** (optional, 0.1.0): for an app whose code must be public while the project files stay private. Each release copies the app files to a public repo (one commit plus the tag, no history) through `.github/workflows/mirror.yml` and `scripts/mirror/public-tree.ts`; it starts when `Release tag` finishes. Rules in `STACK.md`, one-time setup in `RELEASE.md`, review checks in `REVIEW.md`. Origin: chess-coach CC-044. **App action:** none unless wanted (`pack add mirror`). chess-coach already has its own version; it moves to this trigger when it adopts `Release tag`, because a tag made by a workflow doesn't start its tag-push trigger.
- `prd-intake` takes a document as input: a spec or PRD (for example from `product-management:write-spec`), a Google Doc or Claude Doc, or discovery docs in the repo. `new-app` step 8 passes them on.

### Changed

- **Web pack hosting defaults:** `render.yaml` uses paid plans (web `starter`, database `basic-256mb`, about $13 a month), because Render's free database is deleted after 30 days. Free stays possible for a throwaway trial. Origin: chess-coach CC-036/CC-063. **App action:** none for existing apps (starter file).
- `new-app` works on a repo that already exists (for example after an inception phase): it skips creating the repo, keeps the existing docs and skills, and merges the template into an existing `CLAUDE.md`. Origin: band-studio-os.

## [0.2.8] - 2026-10-14

### Added

- `cloud-setup.mjs` hook: a `SessionStart` step, cloud sessions only, that runs `npm ci` when dependencies are missing or older than the lockfile (fixes `npm run check` failing on untouched files because the container's global Prettier is older than the repo's), sets `PW_CHROMIUM` for Playwright, and runs the app's optional `scripts/cloud-setup.sh` (databases and other app needs). The `settings.json` and `CLAUDE.md` templates wire it in and document it. Origin: chess-coach, where every cloud thread rediscovered both frictions. **App action:** `harness-sync pull`, then add the hook to `.claude/settings.json` `SessionStart` (apps own that file) and, if the app needs more than `npm ci`, add `scripts/cloud-setup.sh`.

## [0.2.7] - 2026-10-14

### Removed

- The usage analytics feature is gone: the `session-usage` plugin and every reference to it. `test-handoff` bug items no longer need a `Found in` line. **App action:** `harness-sync pull`.

## [0.2.6] - 2026-10-14

### Added

- Roadmap list in `docs/BACKLOG.md` (Now / Next / Later ids) with a check: the `base` pack ships `scripts/roadmap/` and `tests/unit/roadmap.test.ts`, plus `roadmap:check` and `roadmap:data` scripts. The `CLAUDE.md` template gains a "Backlog and roadmap" section (who owns what), `prd-intake` places new items in the list and `test-handoff` removes finished ones. Origin: chess-coach, where the roadmap page had fallen behind the backlog. **App action:** `harness-sync pull`; add a `## Roadmap` list to `docs/BACKLOG.md`, copy the new starter files, and add the "Backlog and roadmap" section to `CLAUDE.md`.

### Fixed


## [0.2.5] - 2026-10-12

### Added

- `studio-sync.mjs pack remove <name...>` drops a stack pack an app no longer uses: its managed files are deleted and the lock forgets it. The pack's starter files and `package.json` entries stay the app's own. The `artifact` pack itself is unchanged and stays available for other apps; a web-only app can drop it (chess-coach did, CC-055). **App action:** `harness-sync pull` (the command comes with the sync script).

## [0.2.4] - 2026-10-12

### Changed

- `release` and `test-handoff` give Ale only the links where a change can be seen. A web-only fix no longer lists the artifact and Lab links as things to test (found in chess-coach v0.21.1, CC-048). **App action:** `harness-sync pull`.

## [0.2.3] - 2026-10-12

### Changed


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
- `scripts/core-lint.mjs` and a small CI run that keep the core free of app and stack details.

### App action

- Existing apps: `install` adds `CLAUDE.md` and `.claude/settings.json` only when missing. Add the App profile to the app's `CLAUDE.md` by hand, add the `SessionStart` hook from the settings template, and remove any `enabledPlugins` entry for `studio@app-studio` so the skills don't load twice. Run `install` with `--force` once the app-specific lines in the old local skills have moved to the App profile.

### Removed

- The `studio-ping` spike skill.

[Unreleased]: https://github.com/ildruido/app-studio/compare/main...HEAD
