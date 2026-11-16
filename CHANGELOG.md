# Changelog

All notable changes to the studio harness. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

## [Unreleased]

### Added

- Origin: auto-merge plan v2, step 4 (issue #64), the rule switch. `docs/GOVERNANCE.md` sections 5, 7 and 9 and the app-studio Project instructions now say app-studio PRs merge by tier: Ale's tier waits for Ale's OK (then the label `ale-ok`), every other tier is merged by auto-merge when `check` is green, and a thread confirms the PR merged before it hands back. The handover notes the change. app-studio only; apps are not affected. No **App action**. **Ale action** (two clicks, after this PR merges): tick Settings → General → Pull Requests → Allow auto-merge, and replace the Project's "What do you want to work on?" text with the new topic given in the PR. The coordinator applies the Project instructions itself.
- Origin: auto-merge plan v2, found merging PR #60 (issue #61). GitHub kept refusing a green PR ("Required status check `check` is expected"): the `check` posted through the API was filed in the first check suite of the commit, which for an Ale's-tier PR is a failed or cancelled run. `check` is now a job of the run itself (the old `gate`), so it sits in its own suite. CI only; apps are not affected. No **App action**; **Ale action** for this PR only: it can't pass the old gate, so it needs a one-time admin merge (the ruleset has no bypass).
- Origin: auto-merge plan v2, follow-up to #52 (issue #56). The old CI path, judged by the PR's own copy of `ci.yml` (the `pull_request` trigger, `legacy-verify` and the old `check` job), is removed now that the base-branch `gate` has been seen judging a PR that edited the CI file and the tier script. `check` is posted only by `gate`, and `scripts/ci-guard.test.mjs` fails if another trigger comes back. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, gap in #50 (issue #52). A PR could edit `.github/workflows/ci.yml` and be judged by its own edited rules. CI now runs from the base branch (`pull_request_target`): the tier and release check run the scripts as they are on `main` over the PR's files, the PR's own tests run in a read-only job, and a final job posts `check` on the PR's head commit, so the PR can't change how it is judged. Any change under `.github/` is Ale's tier (now covered by `scripts/ci-guard.test.mjs`, which also fails if a job with write access checks out PR code). Manual runs (`workflow_dispatch`) are gone. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, issue 2 (#50). CI now sets each PR's risk tier from the paths it changes (`scripts/tier.mjs`, run as it is on `main`, so a PR can't lower its own tier): Ale's tier for the loader, CI, tier rules, setup script, unknown files, rule files unless the wording check passes (at most 30 words, no rule word or number, no heading, list item or table row changed), a lost test, a changelog action step or more than about 400 lines; "live check before apps" for what apps get; auto for other docs, added tests and the changelog. A thread can only raise a tier (label `tier:ale`). In Ale's tier, `check` fails until the PR carries the label `ale-ok`, which a thread adds only after Ale's OK and CI removes on every new push (GitHub offers no required reviewers on environments for this private repo, so this is the approved fallback: a tripwire, not a lock); the repo variable `ALL_NEED_ALE=true` sends every PR to Ale's tier. The tier doesn't change who merges yet: Ale's OK still gates every merge until the rule switch. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, issue 1. The required `check` now also runs the packs smoke test whenever a pack or the sync tool changes (before, `Packs smoke` was a separate optional workflow, so a broken pack could merge), and a release check (`scripts/release-check.mjs`): changed harness files need a raised plugin version and a matching changelog entry, and a changed pack needs a raised pack version. The check keeps its name, so the ruleset needs no change; `GOVERNANCE.md` sections 5 and 9 say so. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: #42. A thread offered to continue past its task. `docs/GOVERNANCE.md` section 8 and the app-studio Project instructions now say a thread works only on its assigned issue, hands back and stops when done or blocked, and never proposes or starts the next issue or phase; only the coordinator does. app-studio only, no app templates changed. **Ale action:** paste the updated text from `docs/studio-project-instructions.md` into the app-studio Project's Settings → Memory → Project instructions.
- Closes phase 1 of the handover: `docs/GOVERNANCE.md` section 9 records the repo settings that protect `main` (verified with a test PR), and the handover's phase 1 is ticked. Docs only; they don't reach apps.

## [0.15.0] - 2026-11-16

Live check: pending

Origin: #89 (from the #32 audit, finding 4). Every app's platform layer (`getPlatform()`) had the AI built in (`sample`, `permissionState`, the AI's types), copied from the Claude artifact API, so an app without AI could still call the AI, and a module could not add a capability without editing base and every adapter. Direction (Ale, #32): the core assumes no feature. Design note on #89, approved by Ale on 2026-11-16, with documents, the signed-in user and downloads kept in the core for now.

### Changed

- **The platform has no AI unless the app adds the `ai` module.** Base (0.7.0) `Platform` is `hasRuntime`, `db`, `user`, `downloads`. The `ai` module (0.2.0) adds `getPlatform().sample()` and `permissionState()` with `src/platform/capabilities/ai.ts`, and brings the AI's types (`src/ai.d.ts`) and test fakes (`fakeAi(answer)`). Without the module, code that calls the AI doesn't compile; with it, existing calls compile unchanged.
- **A module adds a capability without editing another pack's file.** It drops one file in `src/platform/capabilities/`; `nullPlatform`, `fakePlatform()` and the artifact adapter (artifact 0.3.0) read that folder. On the web, a module serves its methods with a provider in `src/platform/web-providers/`: `ai-web` (0.2.0) now ships the page's AI client (`sample` over `/api/ai`, the allowance check behind `permissionState("sample")`, its unit tests), which the web pack (0.5.0) no longer has. The web pack's `web-sse.ts` is now `web-http.ts` (the server call and error helpers). `packs/README.md` has a "Platform capabilities" section.
- `fakePlatform()` takes the members to replace (`fakePlatform({ user })`) instead of an AI answer; with the `ai` module, `fakePlatform()` has a fake AI and `fakePlatform(fakeAi("hello"))` picks its answer.
- **Sync guard.** `pull` holds back pack starter files while the app's code calls a module's capability (e.g. `sample()`) without that module, and says which module to add (`check` says "held back"). It also adds starter files new in a pack the app has, where nothing is in the way; held files come in once the module is added. `pack add ai` on a web app (and `check`) says `ai-web` is needed too. Module `pack.json` fields: `platformMethods`, `alsoWith`.
- CI's packs smoke test also builds `web ai-web` and `artifact ai`, and checks that an AI call fails to compile without `ai` and compiles with it (Ale's tier: it edits `.github/workflows/ci.yml`).

**App action** (only for an app that uses AI and was created before the `ai` module: chess-coach, band-studio-os; #36 plans it one app at a time): at the sync that takes this release, `pull` holds back the new platform files and says so. In the same sync, `pack add ai-web` (web) or `pack add ai` (artifact only); unedited platform files then update by themselves, edited ones are merged by hand from `packs/*/starter/src/platform/`. Then change tests that call `fakePlatform("answer")` to `fakePlatform(fakeAi("answer"))`, delete the seed AI status line (`src/modules/ai.ts`) if the app's page replaced the seed, delete the old `src/platform/web-sse.ts` once nothing imports it, and run `npm run check`. The app's AI keeps working as before: the same calls, the same `/api/ai` requests. An app without AI needs nothing.

Not verified: no existing app was migrated (that is #36), so chess-coach's and band-studio-os's own platform edits were not read; a real Claude artifact runtime and a live web server with AI were not used (the unit tests fake both).

## [0.14.0] - 2026-11-16

Live check: pending

Origin: #84 (from the #32 audit, findings 5, 6 and 11). The App profile assumed every app uses AI and is private; the spec phase now decides.

### Changed

- The App profile has a **Features** part: **AI** (on or off), **Access model** (only invited people, anyone who signs up, anyone with no login, or whoever the owner shares it with) and **Storage shape** (per-person documents, shared documents, or something else). `prd-intake` asks the three questions one at a time with no preselected answer and records them; the harness never picks them.
- The AI rules (the runtime rule, and the AI items in `reviewer`, `qa`, `planner` and `build-feature`) apply only when the profile says AI is on. The **AI plan** row is required only then; with AI off, any AI code is a blocking review finding.
- The health check fails when AI, Access model or Storage shape is missing, empty or still a placeholder, or when AI is on with no AI plan.
- `release` runs a new gate (`studio-sync.mjs release-gate`) and stops, with a clear message, while the Access model is blank.
- Wording: dropped "voice" from the capability list and the "Ale, as a player" example in the template.

**App action:** each app adds three rows to its App profile table in `CLAUDE.md` (`AI`, `Access model`, `Storage shape`) at its next sync, or its commits are blocked by the health check until it does. chess-coach and band-studio-os record `AI | on` with their existing AI plan, `Access model | only invited people`, and their storage shape (Ale's 2026-11-16 decision: no behaviour change).

## [0.13.1] - 2026-11-16

Live check: pending

Origin: #85 (from the #32 audit, findings 8 and 12). The artifact pack's App-profile hint named "a Lab-style preview build", a term from one app.

### Changed

- `packs/artifact/managed/STACK.md` now says "an extra preview build". Artifact pack version 0.2.2.
- `core-lint` now also scans packs for one app's own build names (`Lab`, `build:lab`, `dist-lab`) and specific artifact links, so the next one fails CI. Stack words a pack legitimately names (`window.claude`, `modelTier`, `Render`, the 16 MB limit) stay allowed in packs and banned in the core. A test plants "Lab-style" in a pack doc and checks the lint fails.

No **App action**: apps get the reworded line at their next `harness-sync`. To be folded into the next combined studio-scratch check.
## [0.13.0] - 2026-11-16

Live check: pending

Origin: #86 (from the #32 audit, finding 2). The web pack's server carried the AI endpoint, the monthly allowance, the usage table, the `ANTHROPIC_API_KEY` setting, AI tests and QA items, so an app without AI still had all of it. Direction (Ale, #32): the core assumes no feature; AI is an opt-in module. chess-coach and band-studio-os keep today's behaviour by switching it on (Ale, 2026-11-16).

### Added

- **Server modules in the web pack** (web 0.4.0). The web server now loads every file in `server/src/modules/` at start-up (the admin command does too): a module adds routes at `/api/<name>`, admin commands, a note per person in `list-users`, and removes its data when an account is deleted, without editing any file the web pack ships. Its tables go in `server/migrations/<name>_NNN_*.sql`, and the browser-test server loads scripted stand-ins from `server/e2e/modules/`. `packs/README.md` describes it; the sign-in modes (#88) reuse it.
- **The `ai-web` module** (0.1.0, `pack add ai-web`, which also adds `web` and `ai`): the AI endpoint with page tools, the monthly allowance per person, the usage ledger, the `set-allowance` admin command, `ANTHROPIC_API_KEY` and model settings, the scripted AI for browser tests, its QA and review items, and the `/api/ai` contract (now in `.claude/packs/ai-web/STACK.md`, no longer in `docs/API.md`). The code and its tests are the ones the web pack had, moved; only the wiring changed (the endpoint is built by `src/modules/ai.ts`). Its migration `ai_001_usage.sql` creates the usage table and the allowance column only if they are missing, so it runs unchanged on a database that already has them (a test does exactly that).
- CI's packs smoke test also builds `web artifact ai ai-web` (Ale's tier: it edits `.github/workflows/ci.yml`).

### Changed

- **A new web app starts with no AI.** Without `ai-web` the server has no AI folder, no usage table, no allowance column, no `ANTHROPIC_API_KEY` in `render.yaml` or `PREVIEW.md`, no AI test or QA item, and `/api/ai/*` answers like any unknown route. `new-app` step 7 says to add `ai-web` for a web app whose profile has AI on. The `ai` pack is 0.1.1 (its notes point at `ai-web`).
- `list-users` no longer shows allowances unless `ai-web` is there; with it the output is the same as before.

No **App action**: existing apps own the files they copied and keep the AI as it is. Note for #36 (moving chess-coach and band-studio-os onto the modules): `pack add ai-web` adds `ai_001_usage.sql`, which runs once, changes nothing on their database and records itself; their old `002_auth.sql` and `003_ai_usage.sql` stay as they are. Not verified: a real web app with a live Postgres database and deploy (that is #34), and the web adapter's `/api/ai` calls in `src/platform/web.ts` are untouched (a no-AI web app still contains that client code; what the page shows when it calls a server without `/api/ai` was not checked).

## [0.12.0] - 2026-11-16

Live check: pending

Origin: #83 (from the #32 audit, finding 1). Every new app's seed page asked the host for the AI on load and its smoke tests checked "The AI is ready", so an app without AI had to delete that on day one. Direction (Ale, #32): the core assumes no app feature; the spec phase picks opt-in modules.

### Added

- **Feature modules.** A module is a pack for a feature the app opts into, marked `"kind": "module"` in its `pack.json`; it installs, updates and removes like a stack pack, and `pack add` lists modules separately. `packs/README.md` has a new "Modules" section. This is the mechanism the next modules (server AI, roadmap, sign-in modes) reuse.
- **The `ai` module** (`pack add ai`, version 0.1.0): the seed's AI status line (`src/modules/ai.ts`) and its unit tests. The seed page mounts any `src/modules/*.ts` file, so adding the module needs no edit to the app's files.

### Changed

- **New apps start with no AI.** The seed page (base pack 0.6.0) shows the app title and "Ready.", makes no AI call, and none of its tests mention AI; the artifact (0.2.1) and web (0.3.3) smoke tests check "Ready" instead. `new-app` step 7 now says to add the modules the App profile calls for (`pack add ai` if the app uses AI) instead of deleting the AI call. The web pack's server AI endpoint is unchanged (next issue).

No **App action**: existing apps own their starter files and keep their page. An app whose seed `src/main.ts` is still untouched gets the new AI-free seed at its next pull; `pack add ai` brings the status line back.

## [0.11.1] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: the pull with `--live-check` updated to 0.11.1; PR #13 merged on its own once CI was green. Not verified: no live API call was made, so the new default models `claude-haiku-5-5` and `claude-sonnet-5-5` were not tried against the real API.)

Origin: #33. The web pack's default AI models were the 4.5 generation.

### Changed

- New web apps now default to Claude Haiku 5.5 (`claude-haiku-5-5`, quick tier) and Claude Sonnet 5.5 (`claude-sonnet-5-5`, default tier): same cheap/mid split as before, current generation. The ids live in one constant (`DEFAULT_MODELS` in the web starter's `config.ts`); `AI_MODEL_QUICK` / `AI_MODEL_DEFAULT` still override them. Pack version 0.3.2. Prices were not checked: cost per call may differ from 4.5.

No **App action**. Existing apps can opt in by setting `AI_MODEL_QUICK=claude-haiku-5-5` and `AI_MODEL_DEFAULT=claude-sonnet-5-5` on the server (pack starter files are copied once into an app and not updated by sync).

## [0.11.0] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: pull with `--live-check` reached 0.11.1 including 0.11.0; Project instructions applied; PR #13 merged on its own. For the new PR rule, the thread for PR #14 subscribed to it, set the 3-minute check-in, and reported CI and the merge without being asked.)

Origin: #78 (Ale). Threads didn't notice their PR's CI result or merge, so Ale had to tell them: the rules only said to check after a while, and nothing subscribed the thread to the PR's activity.

### Changed

- After opening a PR, a thread now subscribes to it (`subscribe_pr_activity`) and also schedules a check-in about 3 minutes out as a backup; it reacts to a red check or the merge itself and unsubscribes once the PR is merged. In the app template: `CLAUDE.md` "Git workflow" (the wake-up is now about 3 minutes, was 5), the Project instructions template and the `build-feature` skill. For app-studio itself: `docs/GOVERNANCE.md` section 5 and `docs/studio-project-instructions.md`.

**App action:** copy the new bullet from the template's `project-instructions.md` ("After opening a PR, subscribe…") into the app's Project instructions, after `harness-sync`. **Ale action:** none; the coordinator applies the new app-studio Project instructions itself.

## [0.10.0] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: the "Backlog and roadmap" change was exercised with a small copy item, PR #14, which merged on its own once CI was green. The test script was posted to Ale word for word in the Project chat, not as a pointer to `docs/BACKLOG.md`: "1. Open the app and add 5 habits (for example Read, Walk, Water, Stretch, Journal). Expected: after the 5th, the input and Add button are disabled and the page says: You've reached the limit of 5 habits. 2. Remove one habit. Expected: the message goes away and you can add again." Ale treated that script as passed without running it by hand.)

- Origin: issue #29, found in the studio-scratch end-to-end test. Ale decided: **the coordinator in the Project chat owns the backlog and Ale's product decisions**, with no standing roadmap thread (it would be the long-idle thread the cost analysis found most wasteful); backlog changes happen in short threads the coordinator starts. And when a release is ready to test, the thread hands back the full test script and the coordinator posts it to Ale word for word in the Project chat, instead of a pointer to `docs/BACKLOG.md`. Changed: template `CLAUDE.md` ("Backlog and roadmap"), template `project-instructions.md`, skills `test-handoff`, `build-feature` and `release`. **App action:** at the next sync, copy the changed "Backlog and roadmap" bullets from the template `CLAUDE.md` into the app's `CLAUDE.md`, and re-paste the template Project instructions into the Project.

## [0.9.1] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: a probe file made with a shell command only was blocked by the Stop hook with all 5 lint errors; the probe was deleted and never committed. Caveat: the Stop hook was run directly by the thread, not fired at a real end of a turn, so that firing is not verified.)

Origin: #28 (studio-scratch, HT-002). Code files changed with shell commands (heredocs, scripts, `cat >>`) were never linted: the per-file ESLint hook fires only on Edit/Write, so the hook log showed no lint entries and the error surfaced only at `npm run check`.

### Changed

- The Stop hook (`check.mjs test`) now first lints, in one ESLint run, every TS/JS file changed since the last push, however it was edited: uncommitted edits, new untracked files and unpushed commits. A lint error blocks the end of the turn, like a failing test. The per-edit lint hook stays. No new hook is wired, so `settings.json`, the health check and the loader are unchanged; in the hook log the run shows under `test`, not `lint`. Template `CLAUDE.md` describes it. Apps without ESLint installed, or with no changed TS/JS files, behave as before.

No **App action** beyond the usual `harness-sync` pull. No **Ale action**.

## [0.8.2] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: the default branch check said `HEAD branch: main`; PR #13 merged on its own. Not verified here: a fresh `new-app` run on an empty repo.)

Origin: #31. In studio-scratch the first push to an empty repo made a session branch the default branch, so project threads and the `main` ruleset pointed at a stale branch until Ale switched it by hand.

### Changed

- `new-app` step 10 now confirms that `main` is the repo's default branch (the PR's base, or `git remote show origin`) before asking for the repo settings, and if it isn't, gives Ale the click: Settings → General → Default branch → switch to `main`. The same click is added to Ale's checklist in step 12 when it is still open.

No **App action** (existing apps already have `main` as default; new apps get the skill from the master copy). No **Ale action**.

## [0.8.1] - 2026-11-15

Live check: passed 2026-11-15 (studio-scratch: pull with `--live-check` updated 0.8.0 to 0.8.1, PR #9 merged; a new tiny-item thread handed back and stopped without offering a next item, PR #10 merged; Project instructions re-pasted from the template)

Origin: #71 (follow-up to #42). Threads in app Projects could still offer or start the next backlog item: the stop rule existed only in the app-studio Project.

### Changed

- Template `CLAUDE.md` ("Models and threads") and `project-instructions.md` ("Every thread" and "Coordinator") now say a thread works only on its assigned backlog item, hands back and stops when done or blocked, and never proposes or starts the next item or phase; only the coordinator does. The rule is in the generic core only, so it applies to every stack; packs hold no thread rules.

**App action:** `harness-sync` pull, then copy the new "A thread stays inside its backlog item" bullet from the template's "Models and threads" into `CLAUDE.md`, and re-paste the Project instructions from `templates/project-instructions.md`.

## [0.8.0] - 2026-11-10

Live check: passed 2026-11-15 (studio-scratch: pull without the flag refused, pull with `--live-check` updated 0.7.1 to 0.8.0; studio-scratch PR #8 merged)

Origin: auto-merge plan v2, issue 3 (#59). Once PRs merge themselves, a release can sit on `main` before anyone has tried it in a real Project, and apps pull whatever is on `main`.

### Added

- **Apps can't pull an unchecked release.** `studio-sync.mjs install`, `pull` and `pack add` (so `harness-sync` part A and `new-app`) stop with a plain message, changing nothing, while the newest CHANGELOG entry says `Live check: pending`. The line becomes `Live check: passed <date>` after the studio-scratch check; then everything proceeds. The studio-scratch check itself runs the same command with `--live-check`. `check` and `health` are not affected.

### Changed

- `harness-sync` and `new-app` say what the refusal means. `GOVERNANCE.md` sections 5 and 7 say that a release changing what apps get is committed as `Live check: pending` and confirmed after the studio-scratch check.

No **App action**. No **Ale action**. An app with a copy of `studio-sync.mjs` older than 0.8.0 has no gate itself, but `harness-sync` runs the master copy's script.

## [0.7.3] - 2026-11-10

Origin: #30. A summary claimed that threads "always run the latest harness", which is wrong: they run the latest loader over each app's pinned copy of the harness.

### Added

- README: "Two update paths" explains what changes by itself (the loader) and what changes only at `harness-sync` (the harness content), and why.
- A test that runs the current loader against an app copy as old as 0.6.0 (lock, skill, agent and hook only), so a loader change can't silently break older apps.

### Changed

- The loader's header comment no longer says threads run "the current harness".

### Also added

- `docs/GOVERNANCE.md`: how app-studio evolves (its own Project, issues as the one queue, triage, building, Ale's OK on merges, the two paths by which changes reach apps, live verification in studio-scratch). `docs/HANDOVER-2026-11.md`: the context of the 0.6.0 to 0.7.2 rework, how to set up the app-studio Project, and the ordered work (#28 to #37). `docs/studio-project-instructions.md`: that Project's instructions. Docs only; they don't reach apps.

No **App action** and no **Ale action**.

## [0.7.2] - 2026-11-10

Origin: the first harness sync under 0.7.0. The PR was opened as a draft (its `CI gate` failed on purpose), then marked ready and went green, but the merge hook still counted the old red run and blocked the merge; and auto-merge couldn't be switched on because the PR was already green.

### Fixed

- **Merge hook**: only each check's latest run counts, as on GitHub, so a re-run or the run that replaced a draft's supersedes the older one.

### Changed

- **PRs are opened ready for review**, not as a draft first: CI runs once, and no alarming draft-stage red `CI gate` appears.
- "Git workflow": when GitHub says a PR is already clean, merge it straight away. `new-app` step 10 does the same and verifies auto-merge on the next PR.
- Template: the CI paragraph describes the 0.7.0 behaviour (Markdown- and `.claude/`-only PRs run only the quick `CI gate`).

**App action:** `harness-sync` pull, then update "Git workflow" and the CI paragraph in `CLAUDE.md` from the template.


## [0.7.1] - 2026-11-10

### Changed

- **`web` pack 0.3.1: no more names from the app it was taken from.** The AI endpoint is `/api/ai` (was `/api/coach`), its code `server/src/ai/`, its usage table `ai_usage` (migration `003_ai_usage.sql`), its settings `AI_DEFAULT_ALLOWANCE`, `AI_MODEL_QUICK` and `AI_MODEL_DEFAULT`; tests and docs follow. Starter files only, so existing apps are untouched; a new web app starts with generic names.
- `core-lint` fails on "coach" anywhere in the core or the packs.


## [0.7.0] - 2026-11-10

Origin: the first full run in a Project (bootstrap, then the first feature). It worked end to end, but every PR waited for a "checks finished" notification that often never came, so Ale had to nudge the thread; an empty repo needed Ale to create `main`; the start-up message before the bootstrap read like a fault, so the thread put a false item on Ale's checklist; nothing showed that the hooks had run; and the Project's "What do you want to work on?" box stayed empty.

### Added

- **PRs merge themselves.** Every skill merges as the template's "Git workflow" now says: draft PR, ready, `enable_pr_auto_merge` (squash); GitHub merges once `main`'s required checks are green and deletes the branch. A ~5-minute wake-up replaces waiting idle for a notification; without auto-merge the old read-the-checks-then-merge path remains, behind the merge hook.
- **`CI gate` check** (`artifact` and `web` CI starters): one job that always reports on a PR, so `main`'s ruleset can require it: rightly skipped jobs count as passed, a failed or cancelled job fails it, a draft never passes. PRs now always start a CI run (docs-only and `.claude/`-only ones finish in seconds); pushes to `main` still skip docs-only changes. `.claude/`-only changes count as docs.
- **`Harness` runs on every PR** (base starter), so its `health` check can be required too.
- `new-app` step 10: the one-time repo settings as exact clicks (squash only, allow auto-merge, delete head branches, a `main` ruleset requiring `CI gate` and `health`, no deletion or force push), verified by switching on auto-merge for the bootstrap PR.
- `new-app` step 1: an attached empty repo gets `main` from one GitHub call, without asking Ale.
- `new-app` step 12: a proposed outcome for the Project's "What do you want to work on?" box, for Ale to approve.
- Hook log: each hook run through the environment's launcher is logged in `/tmp/studio-hooks.log` (time, hook, exit code), so a thread can show the hooks ran.

### Changed

- The start-up message before an app has the harness says that only app-studio's skills loading is expected, and `new-app` no longer puts "select the environment" on Ale's checklist unless the message was missing altogether.
- Packs: base 0.5.0, artifact 0.2.0, web 0.3.0.

**App action** (existing apps, optional): to let PRs merge themselves, merge the `CI gate` job and the PR trigger without `paths-ignore` from the pack's `ci.yml` starter, and drop `paths` from `harness.yml`'s PR trigger; then do the repo settings in `new-app` step 10. Until then, threads fall back to reading the checks and merging.


## [0.6.1] - 2026-11-10

Origin: the first end-to-end run in a new Project loaded the **old** `new-app` skill, although app-studio was current. The environment's setup is cached between threads, so the 0.6.0 setup script had copied the skills from an older checkout, and an app's hooks would never have switched on after its bootstrap.

### Changed

- **`scripts/env-setup.sh`** now installs only a fixed launcher and the hook wiring in the start folder's `.claude/`. On every thread start and hook, the launcher runs the current **`scripts/studio-env.mjs`** (new) from the app-studio checkout: it links (not copies) the skills and agents, from app-studio before the app has the harness and from the app's own copy after, runs the app's `cloud-setup` and sync check at start-up, and passes each hook to the app's `check.mjs`. App-studio updates now reach threads without touching the environment, and a thread picks up the app's hooks as soon as the bootstrap is merged. Copies left by 0.6.0 are replaced by links.
- `studio-sync.mjs` no longer forwards the app's hooks to the start folder when the environment's launcher already runs them (they would run twice).

**Ale action:** paste the new `scripts/env-setup.sh` into the "app-studio apps" environment's setup script (Settings → Environments). This should be the last time for a while: later changes to the logic land in `scripts/studio-env.mjs`.


## [0.6.0] - 2026-11-10

Origin: a live test in a Claude Code Project. Threads there start in the folder above the repos, so none of an app's harness skills, agents or hooks loaded; the harness worked only in single-repo sessions. This release makes a Project (one per app, a coordinator plus one thread per item) the main way of working, and makes app-studio change only in its own Project.

### Added

- **`scripts/env-setup.sh`**: the setup script of the "app-studio apps" cloud environment. Before each thread starts, it copies the app's skills and agents into the start folder's `.claude/`, wires the app's hooks with absolute paths, installs dependencies, runs the app's `scripts/cloud-setup.sh`, sets `PW_CHROMIUM` and turns on the git pre-commit check; the thread opens with "Studio harness loaded for the app repo …". With only app-studio attached, it loads the harness skills so `new-app` can start an app. Never fails a session; log in `/tmp/studio-env.log`. Tested live in a Project thread (start-up mode).
- **`harness-idea` skill**: an app sends an idea for the harness as a GitHub issue on app-studio (label `harness-idea`), and changes nothing.
- **`templates/project-instructions.md`**: the Project instructions `new-app` fills in for the coordinator: thread rules (work in the app folder, never change app-studio, hand-over in the PR, post only when done or blocked) and coordinator rules (one thread per item, Sonnet at medium effort, never resume a thread idle for over an hour).
- README: how to set up the environment once and start a new app from an empty Project with one prompt.

### Changed

- `new-app`: follows the Project order (create the Project, then ask the coordinator to start an app). It checks what's attached, asks Ale to create the repo and the coordinator to add it when there is none, and ends with a Project setup report: Project instructions, model settings, and Ale's checklist of clicks. Harness problems found during setup become `harness-idea` issues instead of fixes.
- `harness-sync`: part B (changing the harness) runs only in app-studio's own Project or session and starts from the open `harness-idea` issues; an edited harness file in an app becomes an idea and is restored; roll-outs are one line per app for Ale to paste into that app's coordinator.
- Template `CLAUDE.md`: "Harness" says the harness changes only in app-studio's own Project; "Cloud sessions" explains the environment and keeps `studio-sync.mjs check` as the fallback when the start-up message is missing; "Models and threads" maps onto Project settings and adds "never resume a thread idle for over an hour".
- `cloud-setup.mjs` and the template find the browser in `chrome-linux64` as well as `chrome-linux` (newer container images moved it).

**Ale action:** create the "app-studio apps" cloud environment with `scripts/env-setup.sh` as its setup script (README, "One-time setup"), and select it in each app's Project.

**App action:** none for new apps. For an existing app moving to a Project: `harness-sync` part A, then update "Harness", "Cloud sessions" and "Models and threads" in `CLAUDE.md` from the template, and set its Project instructions from `templates/project-instructions.md`.

## [0.5.0] - 2026-11-04

Origin: an audit of an app in inception (harness 0.4.0), where a docs PR was merged before its `Harness` check finished, and a session with two repos attached committed a broken link with no hook running.

### Added

- **Git pre-commit hook** (`.claude/hooks/pre-commit`): the health check runs on every commit, whoever makes it. Every `studio-sync.mjs` command turns it on (`core.hooksPath` = `.claude/hooks`), including the session-start check; new `hooks` command does only that. A different `core.hooksPath` (Husky, say) is left alone and reported.
- **Several repos in one cloud session:** the session's top folder is then the parent folder, and Claude Code loads `.claude/settings.json` only from there, so no app hook ran. In a cloud session, `studio-sync.mjs` now forwards the app's lint, test, merge and write hooks to the parent folder's `.claude/settings.json`, which Claude Code usually picks up mid-session (seen once in testing, but not after the folder was deleted and recreated, so it's best effort; the git pre-commit hook doesn't depend on it). The template's "Cloud sessions" section tells a session to run `check` first in that layout.
- **Merge gate** (`check.mjs merge`, PreToolUse on the GitHub merge tool): blocks a merge of the app's PR unless its check runs were read after the last push and all finished green (at least one passed). Needs no GitHub token and no paid GitHub plan.
- **Write block** (`check.mjs write`, PreToolUse on the GitHub file-write tools): writing files to the app's own repo through the GitHub API is blocked with a pointer to the local clone, so the health check can't be skipped that way.
- Health check: also scans links in the app's own `.claude/` Markdown (its skills, agents and their templates), fails when `.github/workflows/harness.yml` is missing, and requires the merge and write hooks in `settings.json`.

### Changed

- "Wait for CI" is now "wait for its checks" everywhere (template "Git workflow", `build-feature`, `release`, `new-app`, `prd-intake`, `test-handoff`, `harness-sync`): a Markdown-only PR has no `CI` run but its `Harness` check must pass.
- `harness-sync` part B: how to roll a change out to every app.

Not done, on purpose: being behind app-studio stays a note (CI can't see app-studio, and failing would block every app on any app-studio change); `settings.json` and `harness.yml` may differ from the template (the app owns them); app-specific content checks belong in the app's own tests.

**App action:** `harness-sync pull`, then add the two new `PreToolUse` blocks (merge and write) from `plugins/studio/templates/settings.json` to the app's `.claude/settings.json`; update "Git workflow", "Harness" and "Cloud sessions" in `CLAUDE.md` from the template; make sure `.github/workflows/harness.yml` exists. Run `node .claude/studio/studio-sync.mjs health` (it also turns on the git hook) and fix what it reports.

## [0.4.1] - 2026-11-04

### Changed

- Docs brought in line with 0.4.0: the `harness-sync` skill gives the full order in which `studio-sync.mjs` looks for app-studio (any sibling folder, not only `../app-studio`); the README layout and the template's "Harness" section list `hooks/cloud-setup.mjs` as a shared file next to `check.mjs`.

**App action:** none (`harness-sync pull`; the template change only matters for new apps).

## [0.4.0] - 2026-11-04

### Added

- **Harness health check** (`studio-sync.mjs health`): fails when shared harness files are edited or missing in the app, the App profile still has placeholders, a harness hook is missing from `.claude/settings.json`, one of the app's own skills or agents has no name or description or clashes with a harness one, or a relative link in `CLAUDE.md`, `README.md` or `docs/` is broken. Being behind app-studio is only a note, never a failure.
- **Pre-commit hook:** `check.mjs commit`, a PreToolUse hook on Bash in the template's `settings.json`, runs the health check before every `git commit` Claude makes and blocks the commit until it passes.
- **`Harness` workflow** (base pack 0.4.0, `.github/workflows/harness.yml`): the same check in CI, only on PRs that touch `.claude/`, Markdown or workflows, which the app's main CI skips. Seconds, no install.

### Changed

- `studio-sync.mjs` finds app-studio in any sibling folder, not only `../app-studio`, so a cloud session that clones attached repos side by side compares the copy with the master. In a cloud session without app-studio attached, the session-start check says the comparison was skipped.

**App action:** `harness-sync pull`, then add the `PreToolUse` block from `plugins/studio/templates/settings.json` to the app's `.claude/settings.json`, and copy `packs/base/starter/.github/workflows/harness.yml` into the app (apps own their settings and workflows). Run `node .claude/studio/studio-sync.mjs health` and fix what it reports.

## [0.3.1] - 2026-11-04

### Changed

- `build-feature` step 4: **bugs are reproduced first**: a failing test that shows what Ale saw, then the root-cause fix, then green. Stop and question the design after three failed fixes. Origin: bake-off B3 (Superpowers systematic-debugging / TDD).
- `planner` agent: new **Unspoken risks** section: up to 5 inputs or situations the item doesn't mention but a user will hit, each pinned to a test. Origin: bake-off B3 (Superpowers writing-plans "Review Focus"), which caught HTML names, long names, corrupted data and a midnight bug.
- `reviewer` agent: checks several tabs or devices and day boundaries, checks the planner's Unspoken risks, and grades findings by what Ale would experience, not by the spec's wording. Origin: bake-off B3, where an out-of-spec two-tab overwrite was real data loss.

**App action:** none (`harness-sync pull`).

## [0.3.0] - 2026-11-04

### Added

- **Release tags made by CI** (base pack 0.3.0): a `Release tag` workflow (`.github/workflows/release-tag.yml`) tags each release commit `vX.Y.Z` and creates the GitHub release from the changelog section when the release PR merges. Cloud sessions can't push tags, so Ale no longer has to. `release` skill steps 8 and 11 and the template's "Roles" and "Cloud sessions" sections follow; `docs/RELEASES.md` is only for apps without the workflow. Origin: chess-coach, where Ale pushed pending tags by hand. **App action:** copy `packs/base/starter/.github/workflows/release-tag.yml` into the app (apps own their workflows), then update "Roles" and "Cloud sessions" in `CLAUDE.md` from the template. A tag that is still pending: run the workflow by hand on `main` (Actions > Release tag > Run workflow); it tags the commit that last changed the version. The bootstrap commit (version 0.0.0) is never tagged.
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
