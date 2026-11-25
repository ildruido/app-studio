# Changelog

All notable changes to the studio harness, newest first. Versions follow SemVer: PATCH for wording and fixes, MINOR for a new skill, agent, hook or App profile field. Steps an app must do by hand are marked **App action**.

This file is written only by `node scripts/release.mjs render` from `releases/<version>.json`; do not edit it. Releases up to 0.36.2 are kept unchanged in `docs/CHANGELOG-legacy.md`.

## [0.43.14] - 2026-11-25

Live check: not needed

- the reviewer and qa agents write a result file for the exact commit, and the git pre-push hook and the merge gate refuse a code change without a passing review and QA result (#252).
- For the App Creator: A code change can no longer be pushed or merged until the reviewer and qa agents have written a passing result for the final commit. Any later commit needs a new review and QA run. Docs-only changes are not affected..
- **App action:** none.
- **Admin action:** none.
- Checks: branch review-qa-verdict-files; main none.
- Not verified: A real reviewer or qa agent writing its result through the script was not tried; the unit tests call the script directly. The merge gate was tested with a fake transcript, not a live PR..

## [0.43.13] - 2026-11-25

Live check: not needed

- A second release in the same thread now opens its own PR instead of reusing the previous run's PR number and facts (#305, PR #307).
- For the App Creator: No change for the App Creator.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: A real second release in a thread (only the unit tests ran).

## [0.43.12] - 2026-11-25

Live check: not needed

- Live-check results now reach the PR without a person poking CI, and a result for an already-released version is never relayed to a new PR (#303, PR #306).
- For the App Creator: No change for the App Creator.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: A real live-check relay run end to end (only the unit tests ran).

## [0.43.11] - 2026-11-25

Live check: not needed

- GOVERNANCE says an internal PR opens ready and where to find the finish inputs (#295, PR #304).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Nothing beyond the unit tests; wording only, no code change.

## [0.43.10] - 2026-11-25

Live check: not needed

- Code picks the reviewer: deep on Opus for risky or very large diffs, Sonnet otherwise (#251, PR #302).
- For the App Creator: Risky changes (platform layer, AI, auth, migrations) are now reviewed by a stronger model automatically; routine changes stay on the cheaper one.
- **App action:** none.
- **Admin action:** none.
- Checks: branch review-risk-routing; main none.
- Not verified: That a Project thread really runs reviewer-deep on Opus when build-feature names it (agent pins were proven in #250; this exact flow is only checked by the branch scenario); path patterns can miss a risky change in an unexpected file, only size and listed paths count.

## [0.43.9] - 2026-11-25

Live check: not needed

- Threads waiting on CI, the queue or a live check get a 3-minute check-in re-armed by finish on every step until DONE (#300, PR #301).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Real wake behaviour is being tested live on this PR.

## [0.43.8] - 2026-11-25

Live check: not needed

- The app's CLAUDE.md is less than half its size; long-tail detail is read only when a step needs it (#262, PR #299).
- For the App Creator: Your app's CLAUDE.md template is less than half its size, so every session reads fewer tokens; merge and harness detail is read only when needed.
- **App action:** none.
- **Admin action:** none.
- Checks: branch sync-and-idempotent, helper-agent-sees-app-profile, backlog-lifecycle; main none.
- Not verified: Token counts are estimated from file size, not measured in a fresh app session; existing apps' CLAUDE.md files are not shortened by a sync.

## [0.43.7] - 2026-11-25

Live check: not needed

- live-check facts command reads PR state, checks and files through the GitHub API (#292, PR #298).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Not run against the real GitHub API or a studio-scratch run; parsing is covered by unit tests with canned API responses.

## [0.43.6] - 2026-11-25

Live check: not needed

- GOVERNANCE is now a ~2K-token core; detail moved to docs/governance/ (#263, PR #295).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: A fresh studio thread reading only the core plus one reference file (done-when check) has not run yet.; No studio-scratch check: it never sees these files (GOVERNANCE 7b)..

## [0.43.5] - 2026-11-25

Live check: not needed

- script-only live-check scenarios run in code inside prepare; the runner acts out only thread scenarios (#255, PR #293).
- For the App Creator: Nothing for app projects. Live checks run faster and cheaper: scripted scenarios no longer pass through the runner model..
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Not run in studio-scratch before the PR's own live check: the three converted scenarios were tried only against a local fake scratch app; Per-check token use not compared (/usage before/after); Item 3 (runner model setting) and item 4 (queue batching view) are not done; sync-and-idempotent, backlog-lifecycle and the other command-only scenarios stay thread scenarios for now.

## [0.43.4] - 2026-11-25

Live check: not needed

- The merge queue no longer stalls on drafts or version bumps and no longer depends on the cron that never ran (#296, PR #297).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** 1. None
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Why GitHub never fired the half-hourly cron is not visible from here; the queue now also runs whenever CI finishes, which is only proven on GitHub by the first PR after this release; The workflow_run trigger and the new draft ordering have only run against fakes, not on GitHub.

## [0.43.3] - 2026-11-25

Live check: not needed

- Owner OK survives merging main; the head PR of the merge queue is told when main moves (#290, PR #291).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** 1. None
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: The QUEUE-UPDATE comment and the new CI fingerprint step have only run against fakes and a temporary git repo, not on GitHub; the first real main move after this release is their live test.

## [0.43.2] - 2026-11-25

Live check: not needed

- live-check pass rules read command output that code captured, not the runner's summary (#254, PR #285).
- For the App Creator: Nothing for app projects. Live checks now judge what commands actually printed..
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: Not run in studio-scratch: the runner thread following the new wrapper steps is untested until the next live check; No GitHub-API facts command (item 4): the runner still transcribes PR facts, now told to paste raw responses.

## [0.43.1] - 2026-11-25

Live check: passed 2026-11-25

- A thread working on app-studio itself can't end its turn once without being pointed back to finish while it hasn't reached DONE (#271, PR #284).
- For the App Creator: Nothing changes for apps: the new reminder only applies to threads that work on app-studio itself..
- **App action:** none.
- **Admin action:** 1. Create a cloud environment named app-studio and paste scripts/env-setup.sh into its setup script; leave Default as it is
- Checks: branch loader-follows-checkout; main loader-on-main.
- Not verified: That the Stop hook fires in a real thread of a dedicated app-studio environment (live check after the environment is created).

## [0.43.0] - 2026-11-25

Live check: passed 2026-11-25

- agents pin their model and effort, core-lint enforces it, and the model each helper really ran on is logged (#250, PR #283).
- For the App Creator: Helper agents (qa, planner, reviewer) now run on Sonnet at a fixed effort instead of inheriting the thread's model, so a helper no longer runs on Opus by accident. Ad-hoc helpers default to Sonnet. Each finished helper's real model is logged in /tmp/studio-hooks.log (a subagent line). Skills keep following the thread's model until a one-time check passes..
- **App action:** none.
- **Admin action:** none.
- Checks: branch subagent-model-logged; main loader-on-main.
- Not verified: That a Project thread honours an agent's pinned model: the one-time manual check after release shows it. Whether a hook added mid-session fires before the next session is checked by the branch scenario; if not, the environment needs a re-paste..

## [0.42.5] - 2026-11-25

Live check: not needed

- CI runs every test file automatically, including app-setup tests that never ran (#270, PR #282).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: The change runs in CI for the first time in this PR; only checked locally.

## [0.42.4] - 2026-11-25

Live check: not needed

- GOVERNANCE section 7(a) now matches section 5 and the code: a branch check is enough, and a main check is required only for loader and setup releases (#269, PR #281).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: No live check: studio-internal wording. The project instructions needed no change..

## [0.42.3] - 2026-11-25

Live check: not needed

- finish keeps main's release record when a version clash conflicts, and writes its own only under the new version (#279, PR #280).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: A real two-PR clash was not replayed end to end; a unit test replays the conflict resolution in a temporary git repo..

## [0.42.2] - 2026-11-25

Live check: not needed

- live-check results reach the PR by code, so no thread copies one (#267, PR #268).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: The relay has not yet run against the real studio-scratch mailbox; it is verified live after the merge; Unit tests use faked GitHub responses.

## [0.42.1] - 2026-11-25

Live check: not needed

- the reviewer checks that the live scenarios a change adds really test that change, from leads review-precheck gathers (#265, PR #266).
- For the App Creator: The reviewer now judges whether a change's new live scenarios exercise the change and whether a test fails without it; review-precheck lists the scenarios and a missing test file. Apps without releases/scenarios.json see no difference..
- **App action:** none.
- **Admin action:** none.
- Checks: branch review-scenario-fit; main none.
- Not verified: Whether a real reviewer agent applies the new Scenario fit check well was not tried; the scenario runs the precheck directly.

## [0.42.0] - 2026-11-25

Live check: not needed

- one finish command runs every post-build step by code: version, record, changelog, PR, live check, merge by tier, status (#259, PR #261).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: The live-check path (queue turn, branch request, result, ready; main check and pass-main PR) is unit-tested only: this release is internal, so its first real run is the next app-facing release; The facts the thread collects from GitHub are transcribed by the thread; a wrong transcription would mislead the script; The packs smoke path of the local checks did not run (no pack changed).

## [0.41.0] - 2026-11-25

Live check: not needed

- new-app, intake and handoff helpers: scripts print the pack commands, Admin checklist, project report, App profile rows, handoff lint and the harness-idea issue body (#182).
- For the App Creator: New apps are set up faster and with fewer slips: the stack commands, the Admin's click list, the Project report and the App profile rows come from scripts, the Tester's script is checked against its limits, and harness ideas are filed with the app name and version already filled in. This finishes #182 item 6; nothing changes in how you work..
- **App action:** none.
- **Admin action:** none.
- Checks: branch new-app-helpers; main none.
- Not verified: The skills' new instructions were not run in a full new-app thread; the branch scenario runs the scripts directly; Nothing was tested with skill-creator's trigger prompts: skill descriptions are unchanged, only steps now point to the scripts; new-app's step 1 setup check (N1), install --discovery (N3), CI path-filter check (N5), verify (N6) and start-building wrapper (N9), and migrate-app's plan helpers (M2-M5), were not built: they were outside this issue's named list; The Project report's outcome sentence stays Claude's.

## [0.40.0] - 2026-11-25

Live check: not needed

- the reviewer and QA agents start from scripts: review-precheck lists the mechanical review leads, qa-run builds, runs the changed and baseline browser specs and checks the build output (#182).
- For the App Creator: The reviewer starts from a list of mechanical leads (commit format, Refs, CHANGELOG, secrets, innerHTML, each pack's rules, and a public-repo leak check for mirrored apps); QA starts from one pass/fail table. New apps also get a baseline browser spec (phone width, light and dark, reload, keyboard focus) that runs in CI. This is part of #182 (item 5); item 6 remains..
- **App action:** none.
- **Admin action:** none.
- Checks: branch review-qa-prechecks; main none.
- Not verified: Existing apps do not get the baseline browser specs (starter files are copied only into new apps); their qa-run still works and runs the specs they have; Criteria-to-test coverage (audit A4) is not done: it needs a test naming convention in the template and planner; Whether subagents run the new scripts as written was not tried in a real agent run; the branch scenario runs the scripts directly; The mirror leak rule was unit-tested only, with no real mirrored app.

## [0.39.6] - 2026-11-25

Live check: not needed

- the backlog tool's next-id command counts ids mentioned anywhere in the backlog files, so it no longer hands out an id already used in prose (#229).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch backlog-lifecycle; main none.
- Not verified: the fix is covered by unit tests; the live backlog-lifecycle scenario is the branch check.

## [0.39.5] - 2026-11-25

Live check: passed 2026-11-25

- loader changes are checked on a branch like other app changes; each hook logs which app-studio version it ran; the runner reads the scenario catalog after moving to the commit (#227).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch loader-follows-checkout; main loader-on-main.
- Not verified: the thread-start hook (SessionStart) and scripts/env-setup.sh still run from main only: a thread's first hook uses whatever the checkout holds at start, so they cannot be branch-tested; `env-setup.sh` is unchanged by this release; a loader-stable tag was not built: it is needed only if the live check shows a moved checkout does not run its own loader.

## [0.39.4] - 2026-11-25

Live check: not needed

- app-facing PRs go through a merge queue: one at a time is live-checked and merged (#226).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: the queue has only run against mocked GitHub responses: the real workflow's comments, auto-merge and the CI `queue` job are first exercised by the next app-facing PR; comments and auto-merge made with the workflow token start no CI run (GitHub rule), so after a QUEUE-TURN the build thread updates its own branch; the half-hourly run is the safety net for missed events and was not observed.

## [0.39.3] - 2026-11-25

Live check: not needed

- CI blocks app-facing PRs until a branch live check passed for their current app-facing changes (#225).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: the gate has never read the real studio-scratch #72: it needs the read-only secret LIVE_CHECK_TOKEN (Admin, once) and the runner thread; until then every app-facing PR fails `check` with a clear message, internal PRs are unaffected; the fingerprint is computed by git on the CI runner and on the build thread's checkout; their agreement is unit-tested on a throw-away repo only, not yet in a real PR.

## [0.39.2] - 2026-11-25

Live check: not needed

- Live checks can run through the studio-scratch PR mailbox: request, prepare, judge and result are code (#224).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: not run through the real mailbox yet: the runner thread in studio-scratch does not exist until the Admin pastes the start prompt in docs/LIVE-CHECK-RUNNER.md; whether the runner thread still wakes after days idle, and whether a result review posted by a bot account wakes the build thread, are untested (the result is posted by Claude for now); the real-world git steps (reset, sync of a studio-scratch app) are tested only on local throw-away repos.

## [0.39.1] - 2026-11-25

Live check: not needed

- The sync report no longer lists steps of rolled-back releases (#234).
- For the App Creator: The sync report no longer asks for the 0.36.0 Admin step (add ANTHROPIC_API_KEY), which was rolled back.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: not run live in a studio-scratch sync; checked on this repo's records and by unit test.

## [0.39.0] - 2026-11-25

Live check: not needed

- A catalog of live-check scenarios with checkable pass rules, and a rule that a release names the scenarios it needs (#223).
- For the App Creator: nothing changes.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: not run live in a Project thread: internal change, no app-facing file changed; scenario prompts and pass rules are seeded from the 2026-11-24 manual check and the 0.38.0 check; none has been run through the (not yet built) runner (#224), so the output patterns are untested against real results.

## [0.38.1] - 2026-11-25

Live check: passed 2026-11-25

- A sync prints the release report once, and shows none when it refuses (#222).
- For the App Creator: The sync report no longer prints twice, and a sync that stops on an unchecked release shows only the stop message.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none; main sync-report-once.
- Not verified: not yet run live in studio-scratch.

## [0.38.0] - 2026-11-25

Live check: passed 2026-11-25

- A sync now blocks on any unchecked release in range and prints a short report from the release records (#222).
- For the App Creator: After a sync you get one line per release and a "Needs you" list instead of a changelog excerpt to read; A sync stops if any release between your version and the newest is still waiting on its live check, not only the newest one.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none; main sync-report-and-gate.
- Not verified: not yet run live in studio-scratch (a sync there must print the report and refuse while a release is pending); skill-creator test prompts for the changed harness-sync step not run; the change replaces one step with a shorter one.

## [0.37.0] - 2026-11-24

Live check: not needed

- Release data is now one record per release, and CHANGELOG.md is written only by script (#221, PR #230).
- For the App Creator: nothing changes yet; the sync report and gate start using the records in a later release.
- **App action:** none.
- **Admin action:** none.
- Checks: branch none (internal change, apps never receive it); main none.
- Not verified: not run live in a Project thread: internal change, no app-facing file changed; kind-versus-tier and issue/PR reference checks are left to the CI branch gate (8-step plan, step 6).

## [0.36.2] - 2026-11-23

Live check: passed 2026-11-24

- Origin: follow-up to the 0.36.1 rollback. Two empty placeholder test files were kept only so CI, which ran the old workflow from main, could pass the revert. They are deleted now. No behaviour change.
- For the App Creator: nothing changes. **App action:** none beyond the normal `harness-sync`.
- Not verified: only the repo checks were run.

## [0.36.1] - 2026-11-23

Live check: passed 2026-11-24

- Origin: the App-Studio Owner asked to roll back 0.36.0 (PR #217, issue #216): the automated live checks don't do what was asked, and a different approach will be decided later. This release is a plain GitHub revert of that PR, so the harness is back to exactly the 0.35.3 files; only the version number moves on (0.36.0 was released, so it can't be reused).
- Removed: the end-to-end suite (`scripts/e2e.test.mjs`) from `check`, the behaviour check and its workflow, the GOVERNANCE section 7 and studio-instructions wording that made live checks code, and the `new-app` scaffold wording. The hook failure summary change from 0.36.0 (node:test file:line) is rolled back with it. The 0.32.1-0.35.3 live-check lines are back to what they were before 0.36.0.
- For the App Creator: back to the 0.35.3 behaviour. **App action:** none beyond the normal `harness-sync`. The Admin does not need to add `ANTHROPIC_API_KEY`; if it was added, it is unused.
- Not verified: the revert was checked by running the repo's checks, not live in a Project thread. The 0.36.0 entry below stays as history.

## [0.36.0] - 2026-11-22

Live check: rolled back in 0.36.1 (never applied to apps)

- Origin: issue #216 (the App-Studio Owner: manual live checks cost their time and many model tokens). Live checks are now code. (1) `scripts/e2e.test.mjs`, in `check` on every PR, no AI: builds a throwaway app from the template next to a git copy of app-studio with local origins, in an isolated HOME, and runs only the real command lines: `install`, `sync` (live-check gate, `--live-check`, already in step, edited file then `--force`), `release-prepare` in a shallow tagless clone, `release-cut`, `release-tag-check`, `live-check-pass`, `backlog.mjs`, and every hook through the loader (failing test at Stop, the saved note shown once, the commit health check, the app-studio and Owner-merged blocks, the merge gate). It also checks the runner's real settings are untouched. (2) `scripts/behaviour-check.mjs` and the `Behaviour check` workflow: headless Claude Code on a throwaway app for what only the model shows (Claude fixes a test the Stop hook reports; the reviewer quotes the App profile without opening `CLAUDE.md`), code assertions on the answer and tool calls, on `main` after a changelog change or by hand; skipped without the `ANTHROPIC_API_KEY` secret. (3) GOVERNANCE section 7: a release is live-checked by these; a manual studio-scratch check only for what neither reaches, named in the entry. New entries start `Live check: passed <date> (automated: end-to-end tests)` (`status --scaffold`). (4) Fix found by the new tests: the unit-test hook's short summary now gives file:line for node:test's default TAP output (what `npm test` prints in a hook), not only for the spec reporter.
- For the App-Studio Owner: no more copying prompts and results between Projects. For the App Creator: a red node:test run names the failing file and line. **Admin action:** add the repository secret `ANTHROPIC_API_KEY` once to turn on the behaviour check (until then it is skipped). No **App action** beyond the normal `harness-sync`.
- Not verified: the behaviour check has not run with a real model (no key in this session; its plumbing is tested with a stand-in); the end-to-end tests use local origins, not GitHub or the cloud proxy, and no real Project thread.

## [0.35.3] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #214 (found in the live check of 0.33.0). In a Claude Code Project thread, a failing unit test at the end of a turn could go unnoticed: the Stop hook ran and blocked (the hook log showed `test exit=2`), but its message never reached Claude and the turn simply ended. Our hook sends the block the documented way, and it reaches Claude when the same Claude Code runs outside a Project thread, so the message is lost around the end of a Project thread's turn. The loader (`scripts/studio-env.mjs`) now keeps a blocking Stop-hook failure and hands it to Claude at its next tool call in the same session, once, unless the session's transcript shows Claude already got it. A green end-of-turn run clears it. The hook log shows `test note saved` and `test note shown at <hook>`.
- For the App Creator: a red test can no longer slip by silently; Claude is told about it at its next step at the latest. **App action:** none (the loader runs from app-studio for every app).
- Not verified: whether Claude Code in a Project thread drops the Stop-hook block or the thread host ends the turn could not be reproduced in a container. The note's delivery at the next tool call was tested with Claude Code locally, not in a Project thread. The live check covers that.

## [0.35.2] - 2026-11-22

Live check: passed 2026-11-24

- Origin: found in the studio-scratch live check of 0.35.1. `release-prepare` printed "Last tag: none" although tag v0.2.0 existed on origin. Cloud checkouts are often shallow or made without tags, so the lookup found nothing; the proposed bump and compare links were then wrong. It now fetches the tags first, takes the highest `vX.Y.Z` tag, and falls back to asking origin directly. Only the tag lookup changed.
- For the App Creator: nothing changes in how you ask. **App action:** none beyond the normal `harness-sync`.
- Not verified: tested on local git repositories (no-tags and shallow clones), not in a cloud Project thread. The live check covers that: `release-prepare` must name the real last tag.

## [0.35.1] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #210 (found checking 0.35.0). Three output slips in the `studio-sync.mjs` commands: (1) `sync` on an app already up to date printed a commit line for a commit that does not exist; it now says "already in step, nothing to commit". (2) `sync` stopped on an edited file and rerun with `--force` printed no changelog excerpt (the first run had already moved the lock), so an App action could be missed; the sync now remembers the version it started on (a small marker inside the app's `.git`, removed when the sync completes) and always prints the excerpt from there. (3) The `release-prepare` dry run pointed to two routes (`--apply` and `release-cut`); it now names only `release-cut`.
- For the App Creator: nothing changes in how you ask. **App action:** none beyond the normal `harness-sync`.
- Not verified: the checks ran on local git repositories only, not in a cloud Project thread. The live check covers that.

## [0.35.0] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #182 (deterministic-code audit, item 4). The repeated, mechanical parts of a release and of a harness update were done by hand, step by step, from the skill text. Now four `studio-sync.mjs` commands do them; what changes and when is unchanged, only who types the steps. (1) `release-cut --version X.Y.Z` (release skill steps 3-5): runs the release gate, stops unless the tree is clean and on what `origin/main` holds (it pulls `main` first) and Unreleased has entries, then makes the release branch, sets the version in `package.json` and moves Unreleased into the dated section. It never commits, pushes or merges. (2) `release-tag-check X.Y.Z` (step 8): says whether the tag is on `origin`, and prints the by-hand tagging steps only for an app without the `Release tag` workflow. (3) `sync` (harness-sync steps 1-4 and 8): brings the app-studio checkout up to its `main` (also from a cloud session branch), runs app-studio's own `pull`, then `health`, and prints the commit line; it stops on the live-check gate, on files edited here (decide each, then `--force`) and on a failed `health`. (4) In app-studio, `live-check-pass X.Y.Z...` changes `Live check: pending` to `passed <date>` in the named entries, all or nothing, and `status` points to it. Choosing the version, tidying the changelog wording, CI status, App and Admin actions, edited files and what to tell the App Creator stay with Claude.
- For the App Creator: nothing changes in how you ask for a release or an update; fewer small slips in both. **App action:** none beyond the normal `harness-sync` (the commands arrive with it; this first sync with them still works with the old steps).
- Not verified: the commands were tested on local git repositories with a local origin, not on GitHub or in a cloud Project thread (fetching through the proxy, a real session branch, `npm version` with a real lockfile). The live check covers that.

## [0.34.0] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #182 (deterministic-code audit, item 3). Routine to-do list upkeep was done by hand in prose, on every request and every release: working out the next backlog id (reading two files on `main` and in every open PR), writing the item template, moving finished items to `docs/BACKLOG-DONE.md` with the version, and keeping the Roadmap list in step. Small slips (a reused id, a missed Roadmap entry, a half-moved item) cost a failed check and a fix. Now one script does the mechanical part: `node .claude/hooks/backlog.mjs next | add | move | done | roadmap-add`. `next` and `add` number from this checkout plus every remote branch; `add` writes the item or bug skeleton (and the Roadmap line when asked); `move` changes section; `done` moves the full item to the top of `BACKLOG-DONE.md`, leaves the title line under Done with the version and takes its id off the Roadmap, and refuses an item with unticked criteria. What an item says, which criteria passed and which Roadmap lane it belongs in stay with Claude. The `prd-intake`, `test-handoff` and `build-feature` skills and the app template's "Backlog ids" rule now point to it.
- For the App Creator: nothing changes in how you ask; fewer small backlog mistakes. **App action:** none beyond the normal `harness-sync` (the script arrives with the hooks; an app without it keeps working by hand).
- Not verified: the script was tested on sample backlog files shaped like the template's (the roadmap module's own checker accepted its output), not on a real app's backlog. The live check covers that.

## [0.33.0] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #182 (deterministic-code audit, item 2). When a check failed, Claude had to dig through long logs (CI job logs, or up to 4,000 characters of hook output) to find the problem. Now a failed check ends with a short summary: what failed, file and line, and the message (at most 30 lines; for several failures the first five and a count). (1) CI: every step of the `tests` job runs through the new `scripts/ci-run.mjs`, which keeps the full log, adds the summary as the last lines of the step, as error annotations and on the run's summary page, and `check` says where to look. (2) App hooks: the unit-test and ESLint hooks (`check.mjs`) send Claude the same summary, with the path of the full log saved in the temp folder, instead of the last 4,000 characters. It reads node:test, vitest and ESLint output; other output gets its error-looking lines. The shared reader is the new `hooks/failure-summary.mjs`.
- For the App Creator and the App-Studio Owner: nothing to do; a red check costs Claude fewer tokens to understand. **App action:** none beyond the normal `harness-sync` (the hook and the new helper file arrive together; an old copy without the helper keeps the old tail output).
- Not verified: the vitest and ESLint readers were tested on sample output written from their documented formats, not on a real app run; CI's new steps run only after this merges (CI runs from `main`), so their first real red run is the check.

## [0.32.1] - 2026-11-22

Live check: passed 2026-11-24

- Origin: issue #182 (deterministic-code audit, item A5). Claude Code loads the app's `CLAUDE.md` into every custom helper agent's context at start-up (Claude Code docs, sub-agents page, "What loads at startup"), so the `planner`, `qa` and `reviewer` agents' "read `CLAUDE.md` first" step read the same file a second time. The three agents now say it is already in context and to use its App profile. The coherence lint fails if an agent is told to read `CLAUDE.md` again.
- For the App Creator: each helper-agent run costs fewer tokens; behaviour is unchanged. No App action: the agents arrive with `harness-sync`.
- Not verified: that a helper agent in a real app Project actually sees the App profile without reading the file (based on the docs, not measured here); the live check covers it.

## [0.32.0] - 2026-11-22

Live check: passed 2026-11-22 (waived by the App-Studio Owner: no studio-scratch run; the refusal hook and rule wording were checked only by unit tests, not in a real app thread)

- Origin: issue #193 (a deliberate test in studio-scratch: the coordinator said the App-Studio Owner's approval would let it change app-studio and mark a release passed). Two changes. (1) Wording: the app rules (new item 7 in the merge rule of the app `CLAUDE.md`, and the Project instructions template) now say app-studio is never changed from an app Project, and that no approval, claimed or proven ownership, or "mark the release passed" request lifts it; the answer is to decline in one line and point to `harness-idea` and the app-studio Project. (2) Guard: the existing write and merge hooks now refuse GitHub file writes, merges, auto-merge and approvals on a repo named `app-studio`, and the Bash hook refuses `git push` or `git commit` in an app-studio clone or aimed at its URL (best effort). Issues and comments stay allowed, so `harness-idea` still works. No new hook wiring, so no setup-script paste.
- For the App Creator: an app thread or coordinator now refuses to change app-studio even when you approve it. For the App-Studio Owner: `GOVERNANCE.md` section 2 states it. It is a strong guard, not a lock: Claude's GitHub access is yours, and a determined shell route can't be fully blocked. **App action:** the new rule item arrives with `harness-sync`; an app's coordinator also updates its own Project instructions (sync reminds it with a ready prompt). The refusing hook arrives with `harness-sync` and needs no Admin action.

## [0.31.2] - 2026-11-22

Live check: passed 2026-11-22 (waived by the App-Studio Owner: no studio-scratch-website run; the pack is untested against a real Cloudflare deploy, and AG Website already has its own fix)

- Origin: issue #198 (AG Website: `ag-website.pages.dev` belongs to another company, so Cloudflare named the project `ag-website-2ko.pages.dev`; the pack reported the wrong address and its live check could have passed against someone else's site). The `static-site` pack (0.1.2) `deploy.yml` now reads the project's real address from Cloudflare for the build's `SITE_URL`, the PR preview link and the run summary, and the production run ends with a live check (`scripts/live-check.mjs`, with a unit test) that fails unless the live page's `<title>` matches this site's and the live site sends no preview `noindex` header. `RELEASE.md` step 4, `docs/PREVIEW.md` and `new-app` now say the address may carry a suffix: the Release target starts as `TBD` and is set to the address the Deploy run reports.
- For the App Creator: a taken pages.dev name is handled; a wrong-site deploy fails loudly. For the App-Studio Owner: nothing to do. **App action** (existing static-site apps only): the workflow, `scripts/live-check.mjs` and `docs/PREVIEW.md` are starter files the app owns; copy them from the pack if wanted (AG Website already has its own fix, ildruido/ag-website#7).
- Not verified: a real Cloudflare deploy (never run from the harness): the API call's field name (`result.subdomain`, per the app's report) and the live check against a real site are untested. The studio-scratch-website check covers `new-app` wording and the pack's build and tests only.

## [0.31.1] - 2026-11-22

Live check: passed 2026-11-22 (studio-scratch-website: the token steps, 1-year expiry, renewal reminder and "screens differ" hint were shown as written; no real Cloudflare deploy, screens not checked against Cloudflare itself)

- Origin: issue #196 (AG Website's owner found Cloudflare's token screens no longer match `docs/PREVIEW.md` step 3). The `static-site` pack (0.1.1) now lists the current path (Profile > API credentials > Create token > Start from scratch > Account policy > Cloudflare Pages: Edit > expiry 1 year), says the token expires after 1 year and deploys stop then (add a renewal reminder to the backlog), and gives a hint for when the screens differ again.
- For the App Creator: new static-site apps start with correct steps. Existing apps keep their own copy of the file (a starter file); fix it by hand if needed. No App action. Not covered: the pages.dev name-taken finding in the issue's second comment.

## [0.31.0] - 2026-11-22

Live check: passed 2026-11-22 (studio-scratch-website: a fresh `new-app` for a bilingual site picked `static-site` + `roadmap` only, no `base`; profile pre-filled with AI off, no login, no storage; checks and 42 browser tests green; no deploy, Cloudflare untested)

- Origin: issue #190 (Ale: a new app must start clean as a static site, because there is no pack clean-up routine). `new-app` step 2 now offers a third kind of app, a static content site (no server, sign-in or database; free Cloudflare hosting). Picking it installs the `static-site` pack alone (no `base`) and follows a new "Static-site path": the App profile gets `AI off`, `Access model anyone, no login (public website)` and `Storage shape none` without asking, no seed page, sign-in mode or AI/user modules, and the Admin's checklist gets the Cloudflare setup with a pointer to `docs/PREVIEW.md`. Discovery-to-build ("start building") offers the same choice.
- The Roadmap list module (`roadmap` 0.2.0) no longer needs `base`, so a site can opt in with `pack add roadmap` (it adds `tsx`); apps on `base` are unchanged.
- App template: the Stack, Release target and Preview target rows and the scripts and platform-layer notes now say what a static site has. `prd-intake` skips the AI, access and storage questions for a site; `harness-sync`, `release`, `build-feature`, `planner` and the READMEs name the pack. New test: a site accepts the roadmap module and refuses `ai`, `web` and `artifact`.
- For the App Creator: a new site app starts with the right pack. For the App-Studio Owner: nothing to do. No App action.
- Not covered: a real Cloudflare deploy (still untested, ag-website will be first) and the pack's CI audit step.

## [0.30.1] - 2026-11-22

Live check: passed 2026-11-22 (studio-scratch, cached environment after the setup-script paste: a new thread opened with "Studio harness loaded" and the PreToolUse hook ran, logged in /tmp/studio-hooks.log; before the fix no hook ran. The merge gate itself is exercised by the re-run of the 0.29.0 check)

- Origin: issue #187 (the live check of 0.29.0 found no harness hook ran in studio-scratch threads). Cause: cloud sessions don't run hooks from a folder's `.claude/settings.json`, only from the user settings (`~/.claude/settings.json`) and the session's own settings; tested side by side in a cloud container. So every hook-based safeguard (merge gate, write block, lint, Stop tests, the 0.29.0 owner-merged refusal) has been off in Project threads. Now `scripts/env-setup.sh` wires the launcher's hooks in the user settings and removes its old wiring from the start folder; its merge hook also covers `enable_pr_auto_merge` and `pull_request_review_write`. The fallback in `studio-sync.mjs check` (a thread that started without the harness) forwards the app's hooks to the user settings too, and drops old copies from the parent folder. New step 6 in the harness-owned merge rule of the app `CLAUDE.md` (reaches every app at its next `harness-sync`): a Project thread that started without "Studio harness loaded" tells the App Creator in plain words that the safety checks may be off, and merges, switches on auto-merge or approves only once `/tmp/studio-hooks.log` shows hooks run; otherwise it leaves the merge to the App Creator. Tested end to end in a cloud container: a real Claude Code session ran the harness hooks from the user settings and a blocking hook stopped the command. What changes for the App Creator: the safety checks actually run in Project threads, and a thread warns when they didn't load. **Admin action:** paste the new `scripts/env-setup.sh` into the "app-studio apps" environment's setup script (Settings, Environments). **App action:** none (the merge-rule wording arrives with `harness-sync`). Not verified yet: a studio-scratch thread after the paste, including that the user settings file carries over when the environment reuses a cached container.

## [0.30.0] - 2026-11-22

Live check: passed 2026-11-22 (studio-scratch: pulled 0.30.0 with the live-check option, health check passed; the app does not use the new pack, so it was not exercised there)

- Origin: issue #183 (ag-website: a free static content site fits none of the stack packs). New stack pack **`static-site`** 0.1.0: Astro and MDX in English and Italian, posts from the app's own `content-sample/` or from a separate content repo (repository variables `CONTENT_REPO` and `CONTENT_REF`, secret `CONTENT_REPO_TOKEN`), its own build, lint, type and test setup, browser tests (both languages, accessibility, phone width, 404), CI with the `CI gate`, the Harness `health` and Release tag workflows, and a deploy workflow for Cloudflare's free static hosting (Pages) with a preview link per pull request posted on the PR and production on release. **Previews are public links**: they send a `noindex` header, can be switched off (repository variable `PREVIEWS` = `off`) and can be protected with Cloudflare Access (`docs/PREVIEW.md` gives the exact clicks, including the one-click "Enable access policy" setting). The pack replaces `base`: `pack add` now refuses to mix `static-site` with `base`, `web` or `artifact` (new pack.json field `conflictsWith`, with a test), and `check` also looks for the pack's `harness.yml`. `scripts/packs-smoke.mjs` and CI's pack smoke build it. What changes for the App Creator: a site that needs no server starts with `pack add static-site` (about 10 minutes of Cloudflare setup, once, in `docs/PREVIEW.md`) and costs nothing to host. **App action:** none for existing apps. No **Admin action**. Not verified: a real Cloudflare deploy, the preview comment and Access protection (they need a Cloudflare account), the workflow files running on GitHub, the content-repo checkout, and the `new-app` skill (not changed: it still offers only artifact or web, so for now `pack add static-site` is run by hand).

## [0.29.0] - 2026-11-22

Live check: passed 2026-11-22 (studio-scratch on 0.31.0 with ildruido/studio-scratch in Owner-merged repos: asked to merge and to switch on auto-merge, Claude refused from the rule; with the GitHub tools reconnected, the merge call was tried and the merge hook blocked it with "only the App Creator merges in ildruido/studio-scratch". Not exercised live: the auto-merge and approval hook paths, covered by unit tests only)

- Origin: issue #184 (ag-website: a content repo where the owner's merge publishes the site). New App profile row **Owner-merged repos** (`none` by default; or `owner/repo` names). In a listed repo Claude never merges, never switches on auto-merge and never approves a PR: the merge hook (`check.mjs merge`, now also on `enable_pr_auto_merge` and `pull_request_review_write`) refuses with "only the App Creator merges in <repo>", and the thread opens the PR and says it waits for the App Creator. `health` checks the row's format and, once a repo is listed, that the app's merge hook covers auto-merge and approvals; the `reviewer` treats code or a prompt that merges there as blocking; the harness-owned merge rule in `CLAUDE.md` says the same. What changes for the App Creator: a repo can be marked "only I merge here", on top of GitHub's own rules. It is a tripwire for Claude's GitHub tools, not a lock: GitHub rules on that repo remain the real protection, and there is no tool for approving a deployment, so none is blocked. Branches are not covered (repos only). **App action:** none for apps that don't use the row; an app that lists a repo needs the new matcher in `.claude/settings.json` (health says so; new apps get it from the template). No **Admin action**. Not verified: a live check in studio-scratch.

## [0.28.1] - 2026-11-18

Live check: passed 2026-11-18 (studio-scratch: pulled 0.28.1, Project instructions updated; one item gave one pointer line, two parallel items one line each, results and test steps in the threads)

- Origin: the live check of 0.28.0 in studio-scratch (issue #165). The rule was too loose: the coordinator restated a finished thread's result and added its own question, and old apps never received the rule in `CLAUDE.md`. Now the app Project instructions template says exactly what the coordinator posts ("what is needed - open the thread", with the link), forbids restating the result, test steps or PR numbers and adding its own question (it overrides a coordinator's habit of relaying results), and gives one line per thread for parallel threads. A thread also asks a release question about its own item. The same rule is now a harness-owned section of the app `CLAUDE.md` ("thread-reports"), which `harness-sync` adds to older `CLAUDE.md` files and keeps current (a test covers it). What changes for the App Creator: the project chat gets short pointers instead of copies of the thread. **App action:** each app's coordinator updates its Project instructions again (`harness-sync` prints a ready prompt). How soon a coordinator that is already running picks up changed instructions is not verified. No **Admin action**. Not verified yet: a studio-scratch live check of the new wording.

## [0.28.0] - 2026-11-18

Live check: passed 2026-11-18 (superseded by 0.28.1; the pull and update worked, the wording was tightened in 0.28.1)

- Origin: issue #165 (less duplicated text between threads and the coordinator), app side; the studio side shipped in PR #170. In app Projects the App Creator now reads and answers in threads, so the app Project instructions template, the app `CLAUDE.md` ("Models and threads") and the `test-handoff` skill say: a thread puts what the App Creator must act on (a product decision about its own item, a manual Admin step, the test script) in its own message, and the coordinator posts one short line with the thread link instead of repeating it. It still summarizes when several threads run in parallel or the matter spans threads, and if the Tester is not in the Project the App Creator can ask for a pasteable copy of the test script. This reverses the old rule that the coordinator posts the test script word for word. What changes for the App Creator: less repeated text in the Project chat. **App action:** the Project instructions template changed, so each app's coordinator updates its Project instructions (`harness-sync` prints a ready prompt). No **Admin action**. Not verified yet: a studio-scratch live check.

## [0.27.0] - 2026-11-18

Live check: passed 2026-11-18

- Origin: issue #172 (token-usage audit: releases spent model tokens on mechanical chores, about 3-8k per studio release PR and 5-10k per app release). Two new `studio-sync` commands. `status` (app-studio, read-only) prints the current version, the next free patch and minor counting versions already held by other branches (so parallel releases stop colliding), and whether the newest release is `Live check: pending` or `passed`; `--scaffold` adds an empty changelog entry. CI's "version not raised" error now names the next free numbers. `release-prepare` (apps) proposes the version from the commits since the last tag, refuses an existing tag, and with `--apply` moves `Unreleased` into a dated section and fixes the compare links; it is a dry run unless `--apply` is given, and the version stays your call (`--version X.Y.Z`). The `release` skill (steps 2 and 5) now uses it. What changes for the App Creator: releases are cheaper and the changelog edit is no longer hand-made. The command arrives with the next sync. **App action:** none. No **Admin action**. Not verified: a real app release (tested on fixture repos only).

## [0.26.0] - 2026-11-18

Live check: passed 2026-11-18

- Origin: issue #173. The `harness-idea` skill's duplicate search (step 2) is now one script, `dup-search.mjs`, shipped inside the skill. It searches open and closed issues labelled `harness-idea` or `studio-backlog`, titled `[harness-idea]` even without the label, or mentioning the given skill, agent, hook, template or pack names, and returns a list of about 20 lines (number, state, title, closing comment), instead of several model-run searches and comment reads (roughly 4-10k tokens per idea before, estimated, not measured). What changes for the App Creator: filing an idea is cheaper and finds earlier or fixed ideas the same way. The model still decides whether an idea is the same, and if GitHub search is unreachable the skill falls back to searching by hand. No new secrets. No App action, no Admin action.

## [0.25.0] - 2026-11-18

Live check: passed 2026-11-18

- Origin: issue #171 (token-usage audit: every sync read the whole 96 KB changelog, about 24k tokens). New `studio-sync changelog [--since X.Y.Z]` prints only the entries newer than the app's version (up to the version being pulled), newest first, with a line naming the entries that mention an **App action** or **Admin action**. `pull` prints the same excerpt after it finishes. The `harness-sync` skill (step 6) now says to read that excerpt instead of the whole file, with a fallback to the newer entries if the command is missing. What changes for the App Creator: a sync costs about 20k fewer tokens and the manual steps are listed up front. The command runs from the app-studio copy next to the app, so older app copies work and the loader is untouched. **App action:** none (the new wording arrives with the next sync). No **Admin action**.

## [0.24.9] - 2026-11-18

Live check: passed 2026-11-18 (studio-scratch PR 38: pulled 0.24.9, health healthy; plain, unprimed requests (save button, test results, blocked hook) were routed to build-feature, test-handoff and harness-idea in real threads)

- Origin: issue #157 (skills coherence audit, trigger misses). Wording of all 8 skill descriptions was tuned with `anthropic-skills:skill-creator`'s method against a realistic test (all skills loaded together, the app's `CLAUDE.md` with coordinator routing, 48 prompts in two styles, 2 runs each). Before, the right skill was picked 73% of the time (user phrasing 65%); after, 97% (user phrasing 97%). What changes for the App Creator: requests like "the save button does nothing", "add dark mode", "I tested v0.3.0, step 5 failed", "publish the new version to the artifact link", "add the web pack" and "this hook blocked my commit, someone should fix the harness" now start the matching skill. `migrate-app` is kept, with a description that limits it to an explicit request to migrate a hand-built or pre-modules app. Descriptions only: no skill body, rule or tool changed. No App action.

## [0.24.8] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 37: update clean and health healthy; new-app gives the one-time repo setup to the Admin; a second pull changed no files. Partly passed: the sync tool's own summary says nothing about Admin actions, so the relay of "No Admin action" depends on the thread reading the changelog, which is accepted by design. Not verified: the app's own tests, running new-app, the "harness is behind" warning.)

- Origin: issue #158 (small items from the skills coherence audit). README and the template's Harness paragraph now list all 8 skills (`migrate-app` was missing). `new-app`: "(below)" fixed to "above"; repo clicks are the Admin's throughout; "start building" now ends by repeating step 12's report to the coordinator, so the instructions and checklist match the new stack. `harness-sync` Part A tells the thread to read the changelog itself (`pull` doesn't print it) and relay any **Admin action** as copy-ready steps. The health message for a missing lock says to install with `new-app`, not `harness-sync`. Not changed: the `new-app` size split and the roadmap pack's `ownerIsAle` (left for a decision). **App action:** none required; the template's Harness paragraph is outside the sync markers, so existing apps keep their 7-skill list unless they edit it. No **Admin action**.

## [Unreleased]

### Added

- Origin: issue #165 (less duplicated text between threads and the coordinator). `docs/GOVERNANCE.md` section 8 and the app-studio Project instructions now tell the coordinator to send a short one-line pointer with a link to the thread when a thread hands back something for the App-Studio Owner to act on, instead of repeating the report; product decisions about a thread's own work are asked and answered in that thread. The coordinator still summarizes when several threads run in parallel (one merged action) or the matter spans threads. The App-Studio Owner can ask a thread for a shorter recap. app-studio only; the app template is unchanged (extending it to apps stays on #165 as a later idea). No **App action**, no **Admin action**; the coordinator applies the new Project instructions itself.
- Origin: the skills coherence review of 2026-11-17 and the tuning of 2026-11-18 (issue #168). Two parts. **Automatic:** `scripts/coherence-lint.mjs` (with `scripts/coherence-lint.test.mjs`) now runs in the required `check` on every PR and fails on checkable drift: skill front matter (name, one-line description, 500 characters, no ": "), skill lists in the README and the app template, the old persona name "Ale" (the roadmap pack leftover is allowed, with a reason), studio-only wording (`owner-ok`, tier names) in files apps receive, and `studio-sync` commands that do not exist. **On request only:** `docs/COHERENCE-REVIEW.md` (steps, the app-studio vs app lenses, report format), the studio-only skill `.claude/skills/coherence-review`, and the routing test `scripts/routing-test/` (48 prompts, builds its fixture from this repo, costs usage). A review is proposed after GOVERNANCE, skill, template or routing changes and run only when the App-Studio Owner says yes; nothing is scheduled. `docs/GOVERNANCE.md` section 5 says so. app-studio only; apps are not affected. No **App action**, no **Admin action**.
- Origin: issue #153 (thread "Check how harness skills are written"). `docs/GOVERNANCE.md` section 5 now requires that a new skill, or a change to a skill's description or behaviour, is drafted and checked with the account skill `anthropic-skills:skill-creator` (tune the description, run a few test prompts), and the PR hand-over says what was tested. Typo and wording-only fixes are exempt; `build-feature`, `new-app` and `harness-sync` get a deeper check; the studio-scratch live check is unchanged. app-studio only; apps are not affected. No **App action**, no **Admin action**.
- Origin: issue #151 (owner OK lost three times on PR #147). In the owner tier, adding the label `owner-ok` now records a fingerprint of the PR's own changes (a comment by CI); the OK stays valid while that fingerprint is unchanged, so updating the branch because `main` moved no longer drops it, and CI removes the label only when the PR's own changes differ (and only from a run for the PR's current commit, so a stale run can't delete a label just added). CI runs for one PR now share one queue so the newest event wins. `docs/GOVERNANCE.md` sections 5 and 9 and the wiki page "How PRs merge" say so; `scripts/ci-guard.test.mjs` guards the new steps. CI only; apps are not affected. No **App action**, no **Admin action**.
- Origin: issue #149 (wiki plan, part 2). New workflow `.github/workflows/wiki-publish.yml` copies `docs/wiki/` into the repo's GitHub wiki whenever it changes on `main` (pages removed from `docs/wiki/` are removed from the wiki), and has a manual run button. It needs no secret (the run's own token, write access on that one job only); `scripts/ci-guard.test.mjs` guards its shape. CI only; apps are not affected. No **App action**. **Admin action** (once, before the first publish): open the repo's Wiki tab, click "Create the first page", type any text, click Save page (this creates the wiki; the publisher then replaces it). If the Wiki tab is missing, tick Settings -> General -> Features -> Wikis first. Then, if the first run failed, open Actions -> Publish wiki -> Run workflow on `main`.
- Origin: issue #146 (wiki plan, part 1). Added 11 wiki pages and a sidebar in `docs/wiki/` (concepts and roles, setup, starting an app, everyday workflow, how PRs merge, updating an app, harness ideas, changing app-studio, packs and modules, known limits), written for the App-Studio Owner, App Creator, Tester and Admin. Docs only; they don't reach apps and aren't published to the GitHub wiki yet (part 2). No **App action**, no **Admin action**.
- Origin: auto-merge plan v2, step 4 (issue #64), the rule switch. `docs/GOVERNANCE.md` sections 5, 7 and 9 and the app-studio Project instructions now say app-studio PRs merge by tier: Ale's tier waits for Ale's OK (then the label `ale-ok`), every other tier is merged by auto-merge when `check` is green, and a thread confirms the PR merged before it hands back. The handover notes the change. app-studio only; apps are not affected. No **App action**. **Ale action** (two clicks, after this PR merges): tick Settings → General → Pull Requests → Allow auto-merge, and replace the Project's "What do you want to work on?" text with the new topic given in the PR. The coordinator applies the Project instructions itself.
- Origin: auto-merge plan v2, found merging PR #60 (issue #61). GitHub kept refusing a green PR ("Required status check `check` is expected"): the `check` posted through the API was filed in the first check suite of the commit, which for an Ale's-tier PR is a failed or cancelled run. `check` is now a job of the run itself (the old `gate`), so it sits in its own suite. CI only; apps are not affected. No **App action**; **Ale action** for this PR only: it can't pass the old gate, so it needs a one-time admin merge (the ruleset has no bypass).
- Origin: auto-merge plan v2, follow-up to #52 (issue #56). The old CI path, judged by the PR's own copy of `ci.yml` (the `pull_request` trigger, `legacy-verify` and the old `check` job), is removed now that the base-branch `gate` has been seen judging a PR that edited the CI file and the tier script. `check` is posted only by `gate`, and `scripts/ci-guard.test.mjs` fails if another trigger comes back. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, gap in #50 (issue #52). A PR could edit `.github/workflows/ci.yml` and be judged by its own edited rules. CI now runs from the base branch (`pull_request_target`): the tier and release check run the scripts as they are on `main` over the PR's files, the PR's own tests run in a read-only job, and a final job posts `check` on the PR's head commit, so the PR can't change how it is judged. Any change under `.github/` is Ale's tier (now covered by `scripts/ci-guard.test.mjs`, which also fails if a job with write access checks out PR code). Manual runs (`workflow_dispatch`) are gone. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, issue 2 (#50). CI now sets each PR's risk tier from the paths it changes (`scripts/tier.mjs`, run as it is on `main`, so a PR can't lower its own tier): Ale's tier for the loader, CI, tier rules, setup script, unknown files, rule files unless the wording check passes (at most 30 words, no rule word or number, no heading, list item or table row changed), a lost test, a changelog action step or more than about 400 lines; "live check before apps" for what apps get; auto for other docs, added tests and the changelog. A thread can only raise a tier (label `tier:ale`). In Ale's tier, `check` fails until the PR carries the label `ale-ok`, which a thread adds only after Ale's OK and CI removes on every new push (GitHub offers no required reviewers on environments for this private repo, so this is the approved fallback: a tripwire, not a lock); the repo variable `ALL_NEED_ALE=true` sends every PR to Ale's tier. The tier doesn't change who merges yet: Ale's OK still gates every merge until the rule switch. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: auto-merge plan v2, issue 1. The required `check` now also runs the packs smoke test whenever a pack or the sync tool changes (before, `Packs smoke` was a separate optional workflow, so a broken pack could merge), and a release check (`scripts/release-check.mjs`): changed harness files need a raised plugin version and a matching changelog entry, and a changed pack needs a raised pack version. The check keeps its name, so the ruleset needs no change; `GOVERNANCE.md` sections 5 and 9 say so. CI only; apps are not affected. No **App action**, no **Ale action**.
- Origin: #42. A thread offered to continue past its task. `docs/GOVERNANCE.md` section 8 and the app-studio Project instructions now say a thread works only on its assigned issue, hands back and stops when done or blocked, and never proposes or starts the next issue or phase; only the coordinator does. app-studio only, no app templates changed. **Ale action:** paste the updated text from `docs/studio-project-instructions.md` into the app-studio Project's Settings → Memory → Project instructions.
- Closes phase 1 of the handover: `docs/GOVERNANCE.md` section 9 records the repo settings that protect `main` (verified with a test PR), and the handover's phase 1 is ticked. Docs only; they don't reach apps.

## [0.24.7] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 35: a Tester report was routed to test-handoff Part B; the AI question was addressed to the App Creator. Not verified: a deployed app.)

### Changed

- Origin: issue #156 (skills coherence audit, findings F3 and F4; the App-Studio Owner decided the wording on 2026-11-17). The app template's Project instructions (Coordinator section) now have two routing lines: Tester results go to a short thread that follows `test-handoff` Part B, and ideas for the harness go through the `harness-idea` skill. In app text, "the owner" is now "the App Creator" (the AI spending-cap decision in `prd-intake` and the App profile, the Access model row, and the `web`, `ai-web` and `roadmap` stack docs and packs README), so an app Claude no longer waits for an App-Studio Owner approval that doesn't exist in app scope; "whoever the App Creator shares it with" stays for the artifact Access option. Pack versions: `web` 0.7.5, `ai-web` 0.3.2, `roadmap` 0.1.3 (docs only). For the App Creator: nothing changes in how you decide, only who the text names. **App action:** the Project instructions live in Project settings, so a sync can't update them: the next `harness-sync` prints a ready prompt; paste it to the app's coordinator, which adds the two lines. **Admin action:** none.

## [0.24.6] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 34: all 3 checks passed; test issue app-studio#163 filed and closed. Not verified: a deployed app.)

### Fixed

- Origin: issue #155 (skills coherence audit, findings F1, F2, F5). Apps were sent down the studio's path to report friction: `build-feature` step 12, the sync tool's "edited files" message and `harness-idea` pointed at `harness-sync` part B, which says apps must never use it. They now say "send a `harness-idea`". `harness-sync` no longer ships part B (the studio-side procedure, which had drifted from `docs/GOVERNANCE.md`); it keeps one pointer: changing app-studio happens only in the app-studio Project, per GOVERNANCE. `migrate-app` drops the one-app-at-a-time rollout rule (a studio-side rule, already in GOVERNANCE section 6). `harness-idea` now also searches closed issues and reads the closing comment before filing, so fixed or declined ideas aren't re-filed, and tells the App Creator the answer arrives at the next `harness-sync`. For App Creators: friction now reaches the studio as an issue. For the App-Studio Owner: nothing changes. No **App action**, no **Admin action**.

## [0.24.5] - 2026-11-17

### Changed

- Origin: persona rename, phase D (the last phase; plan approved by the App-Studio Owner on 2026-11-17). The old names that phases A and B kept working for one release are gone from CI and the tier script: the label `ale-ok`, the tier `ale` and label `tier:ale`, the repo variable `ALL_NEED_ALE`, and the `**Ale action**` changelog marker. Only `owner-ok`, `owner`, `tier:owner`, `ALL_NEED_OWNER` and `**Admin action**` count now. For the App-Studio Owner: a PR in the owner tier needs the label `owner-ok`. For App Creators: nothing changes; `harness-sync` still rewrites an old "Ale" Roles block and "Writing for Ale" heading in an app that skipped earlier releases (kept on purpose). Older entries below are not edited. **Admin action:** none.

## [0.24.4] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: the pull rewrote the old default Roles wording, a second pull made no change, and a new app's CLAUDE.md has no Ale or claude-setup (this also covers 0.24.3). Not verified: an app with custom Roles wording, a deployed app.)

### Fixed

- Origin: found in the 0.24.2 live check in studio-scratch (no issue). An existing app's CLAUDE.md Roles bullets still said "Ale (PM and tester)" and "Claude (engineer)", because a sync leaves an app's own text alone. The first three Roles bullets in the template are now harness-owned (between `studio:begin roles` and `studio:end roles` markers, like the merge rule), so a `harness-sync` pull keeps them current. Migration, once per app: the bullets are replaced only when they match word for word a default from an earlier template; custom wording is left alone and the sync reports "section 'roles' has custom wording" so it can be merged by hand. The fourth bullet ("Where decisions are recorded") and any bullets the app added stay the app's. No **App action** beyond a normal `harness-sync` pull; commit CLAUDE.md with the sync.

## [0.24.3] - 2026-11-17

Live check: passed 2026-11-17 (covered by the 0.24.4 check in studio-scratch: a new app's CLAUDE.md has no Ale or claude-setup. Not verified: the archived handover page.)

### Changed

- Origin: persona rename, phase C (issue #142). Personal leftovers removed so the repo can open to collaborators. `docs/HANDOVER-2026-11.md` is archived to `docs/archive/` with a banner (not deleted). The private claude-setup repo is no longer named in `GOVERNANCE.md` or the app-studio Project instructions; neutral wording says personal setup is outside the harness. The README and `GOVERNANCE.md` no longer point to the handover for Project set-up (they point to `docs/studio-project-instructions.md`). The CLAUDE.md template's Repo row now reads `https://github.com/<owner>/<repo>` instead of a personal account, and the plugin marketplace owner is "App-Studio Owner". `ildruido` stays where it is a real repo URL or sample data (tests). History in this file and apps' roadmap `Owner:` data are untouched; dropping the old names is phase D. No **App action**, no **Admin action**. App-studio Project instructions need two edits (coordinator applies them): drop the handover sentence and "or claude-setup".

## [0.24.2] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: passed except the Roles line, which 0.24.4 fixed (see below). Not verified: a deployed app.)

### Changed

- Origin: persona rename, phase B (issue #140). Every "Ale" in the harness now names a role: **App-Studio Owner** (owns the harness: `docs/GOVERNANCE.md`, the app-studio Project instructions, the README, `harness-sync` part B), **App Creator** (owns an app: its skills, agents, packs, CLAUDE.md template and Project-instructions template), **Tester** (`test-handoff`, the Preview target row) and **Admin** (manual setup clicks: `new-app`, `migrate-app`, the mirror and web packs). The docs use the new names: label `owner-ok`, label `tier:owner`, "the owner tier", variable `ALL_NEED_OWNER`, step **Admin action**. The CLAUDE.md template heading is now "Writing for the App Creator", and the Roles line names the App Creator, the Tester and the Admin. `harness-sync` pull renames an app's heading "Writing for Ale" to the new one and leaves the text under it alone; the rest of an app's own wording is not touched. Packs: artifact 0.4.1, mirror 0.1.1, web 0.7.4 (wording only). The roadmap pack still reads `- Owner:` names as data and is not changed. History in this file, the handover, claude-setup mentions and the old names' removal are for later phases. No **App action** beyond a normal `harness-sync` pull, no **Admin action**.

## [0.24.1] - 2026-11-17

Live check: passed 2026-11-17 (covered by the 0.24.2 check in studio-scratch. Not verified: the old names being dropped (phase D).)

### Changed

- Origin: persona rename, phase A (issue #138). The harness stops depending on the name "Ale": CI, the tier script and `harness-sync` now accept both the old and the new names, so wording can change later without breaking anything. New names (old ones still work for one release): label `owner-ok` (was `ale-ok`), label `tier:owner` (was `tier:ale`), tier `owner` (was `ale`), repo variable `ALL_NEED_OWNER` (was `ALL_NEED_ALE`), changelog step `**Admin action**` (was `**Ale action**`). `harness-sync` pull finds the CLAUDE.md section "Writing for the App Creator" as well as "Writing for Ale". The roadmap pack (0.1.2) treats any `- Owner:` name except Claude as "waits on a person", not only Ale. No wording changed yet. No **App action**, no **Admin action**.

## [0.24.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: the merge rule between markers reached the app through harness-sync. Not verified: a later wording change to a marked section.)

### Added

- Origin: follow-up to #134 (in the 0.23.1 live check the sync did not update the app's `CLAUDE.md` "Git workflow", which still said auto-merge only, because a sync only touched harness-owned files and two lines added in 0.21.1). The app `CLAUDE.md` template now has **harness-owned sections** between `<!-- studio:begin NAME -->` and `<!-- studio:end NAME -->` lines; `harness-sync` `pull` replaces what is between the markers with the template's wording and never touches the rest of the file. The first such section is the merge rule (the "Merging a PR" bullet): an app without markers gets them once, found by its first and last lines; if they aren't found the pull leaves the file alone and says to merge by hand. Future wording changes to a harness-owned section reach apps at their next pull. Edits made inside the markers are replaced, so app-specific rules go outside them. No **App action** (apps get it at their next pull; commit the changed `CLAUDE.md` with the sync), no **Ale action**.

## [0.23.1] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: passed (merge instructions now say read the PR, squash-merge when green, otherwise auto-merge). Not verified: an owner-tier PR.)

### Changed

- Origin: issue #134 (in the 0.23.0 live check, studio-scratch PR 25's checks had already passed when the thread tried to switch on auto-merge; GitHub refused and the thread merged by hand). The merge instructions (app `CLAUDE.md` "Git workflow", the `build-feature` skill) now say: read the PR first; if the checks are already green and it is mergeable, squash-merge now, otherwise switch on auto-merge; never bypass a required check or approval, and Ale's tier is unchanged. `GOVERNANCE.md` section 5, the app-studio Project instructions and the README say the same. Wording only. No **App action** (apps get it at their next pull), no **Ale action**.

## [0.23.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 25: the pull showed "Project instructions template changed" with a ready prompt and health passed; the coordinator compared and updated its own instructions, keeping the app's own lines; `ack instructions` was run and committed; the check then said only "v0.23.0 is in step". Not verified: whether the note returns on a later template change; no migration was run.)

### Added

- Origin: issue #131 (studio-scratch-web and band-studio-os were found with nearly empty Project instructions and no Coordinator section: instructions live in Project settings, so a sync never reached them). The app's lock now records which version of `templates/project-instructions.md` it last reviewed (new apps record the current one). When the template changes, `harness-sync` `pull` and the start-up `check` say "Project instructions template changed: ask your coordinator to compare and update" with a ready prompt; the coordinator updates its own instructions, keeping app-specific text and never replacing it, and a thread then runs `studio-sync.mjs ack instructions`. Apps that never recorded a review are told once. It is a note, never a failing check. No **App action**, no **Ale action**: each app sees the note at its first check after pulling 0.23.0.

## [0.22.1] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 24: an idea was filed as a harness-idea issue with the right label, prefix, app name and harness version; a second, similar idea was added as a comment to the existing issue instead of a new one; the test issue was closed with a comment. Not verified: the issue template on the GitHub website, more than one duplicate case, the sync-summary line about fixed or declined ideas (the app had none), a migration.)

### Changed

- Origin: issue #127 (analysis of how ideas flow). Ideas from apps now arrive complete and leave a trail. The `harness-idea` skill files the same fields as a new `Harness idea` issue template in app-studio (label `harness-idea`, title prefix `[harness-idea]`, App name and Harness version always filled in), and its duplicate check also catches unlabelled ideas and accepted `studio-backlog` work. `harness-sync` part A now tells Ale which of the app's own ideas were fixed (and in which release) or declined. `docs/GOVERNANCE.md` section 4 adds the trail rule: closing an idea leaves one comment naming the release and PR (or the decline reason), accepted ideas move to `studio-backlog`, and lessons from live checks and migrations are filed as `harness-idea` like any app idea. Labels `harness-idea`, `studio-backlog` and `ale-ok` now have descriptions, and issues #102, #106 and #114 got their labels and closing comments. No **App action**; **Ale action**: none.

## [0.22.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch PR 23: an app with no Phase row was unchanged; Phase discovery with TBD values was accepted; Phase build with TBD values failed the health check as intended; new-app's discovery and start-building steps are present (read only). Not verified: build-feature end to end in discovery, a fresh new-app discovery start.)

### Added

- Origin: issue #69. An app in discovery (no stack chosen yet) can say "not decided yet". The App profile has a `Phase` row (`discovery` or `build`; a missing row means `build`, so existing apps don't change) and a `TBD` value (`TBD (decided at build start)`). The health check accepts `TBD` in discovery (App, Id prefix, Repo and Phase must stay real) and fails on any `TBD` in build. `build-feature`, `release` and `test-handoff` stop in discovery (new `studio-sync.mjs phase --build-only`; `release-gate` stops too). `new-app` asks first whether the stack is decided: "not yet" takes a core-only discovery path (harness and the `Harness` health workflow only), and a "Start building" section, run only on Ale's say-so, adds the stack, replaces every `TBD` and sets Phase to `build`. No **App action**; **Ale action**: none. band-studio-os will move its "Inception:" values to `TBD` in its own project, later. Not part of this release: upstreaming band-studio-os's discovery skills and workflow (a separate issue).

## [0.21.3] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch-web: the status line passed in all three cases (no login with cap off, cap used up, signed in with cap off). Not verified: a deployed app, a real AI model, an invite-only app.)

Origin: live check of 0.21.2 in studio-scratch-web: with the site cap off, a visitor who is not signed in was refused (correct), but the status line said "its usage limit is used up", though no limit was ever used.

### Fixed

- **AI status line no longer blames a used-up limit for a visitor who isn't signed in (`ai` 0.2.2, `ai-web` 0.3.1).** With no site cap set, a visitor with no login is refused the AI; the status line now says "The AI is not available to visitors who are not signed in." The "limit is used up" line stays for a cap or allowance that really is used up, and "The AI is ready." for signed-in people. The web adapter now reports a not-signed-in visitor as "not offered" (`null`) instead of `denied`. The status line is in the app's own `src/modules/ai.ts`, so existing apps keep their copy until they take the new starter file by hand or ask for it; new apps get it. No app action needed.

## [0.21.2] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: the Decision log row and the "what wasn't checked" line reached an existing app through harness-sync (PR 22 there). Not verified: a deployed app.)

Origin: live check of 0.21.0 in studio-scratch-web: once the site-wide cap was used up the AI refused, but the page's status line still said "The AI is ready".

### Fixed

- **AI status line shows the limit (`ai` 0.2.1).** The seed's status line now says "The AI is unavailable right now: its usage limit is used up. It comes back when the limit resets." whenever the host reports the AI as denied (site-wide cap reached, or the person's allowance used up), instead of "ready". It is read when the page loads. The line is in the app's own `src/modules/ai.ts`, so existing apps keep their copy until they take the new starter file by hand or ask for it; new apps get it.

### Changed

- **Browser tests can turn the cap on (`web` 0.7.3).** The test server (`server/e2e/server.ts`) now gives modules the sign-in mode and any `AI_*` or `TRUST_PROXY` variable set for the run: `AI_SITE_CAP_TOKENS=20 SIGN_IN_MODE=none npx playwright test`. Nothing changes when they are unset.

**App action:** none required. An app that wants the fixed status line copies the new text from `.claude/packs/ai/starter/src/modules/ai.ts` into its own `src/modules/ai.ts` (an app thread can do it).

## [0.21.1] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: same sync check as 0.21.2 (Decision log row and "what wasn't checked" line added to an existing app); status wording also covered by the 0.21.3 check in studio-scratch-web.)

Origin: live check of 0.19.0 in studio-scratch (the Decision log row and the "say plainly what you did not check" line never reached an existing app).

### Fixed

- **`harness-sync` now brings new template wording to existing apps.** `CLAUDE.md` is the app's own file, so a pull never touched it. A pull now also adds, only when missing: the App profile **Decision log** row (after Storage shape; default is `docs/PRD.md` "Decisions") and the line "Before saying something is done, check it, and say plainly what you did not check" at the end of "Writing for Ale". Both texts come from the template, an app's own row or wording is never replaced, a second pull changes nothing, and `install` leaves an existing `CLAUDE.md` alone. The pull lists what it added; it goes into the sync commit.
- `harness-sync` skill documents it.

**App action:** none. The next `harness-sync` adds the two pieces to `CLAUDE.md`. The coordinator rule from #82 lives in the Project instructions (Project settings), which no sync can reach: the app's coordinator pastes the updated text from `templates/project-instructions.md` once.

## [0.21.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch-web: the site-wide AI cap passed. Not verified: a real AI model, a deployed app.)

Origin: issue #98, Ale's decision of 2026-11-17 (open sign-up apps get the site-wide cap too).

### Added

- **Site-wide AI cap (`ai-web` 0.3.0, opt-in).** The owner sets `AI_SITE_CAP_TOKENS` (tokens per day or month, everyone together; `AI_SITE_CAP_PERIOD`, default `day`) and optionally `AI_PER_ADDRESS_TOKENS`. In a no-login app that is what lets visitors who are not signed in use the AI; past the cap the AI answers `429 rate_limited` (the page's usual "allowance used up") and the page shows it as denied. In an open sign-up or invite app the cap also counts everyone, on top of each person's allowance, since one person can make many accounts. Without the setting nothing changes: a no-login app still refuses the AI. New table `ai_site_usage` (migration `ai_002_site_usage.sql`, safe to re-run).
- `prd-intake` offers the cap as the way to carry out the **AI public use** decision; the owner still decides, and a release still stops until it is recorded.

### Changed

- `web` 0.7.2: docs only (the "no AI for anonymous visitors" lines now describe the cap).

**App action:** none for apps without the `ai-web` module. An app with it gets the cap code at its next `harness-sync` (a new migration runs on its next start) and does nothing unless the owner decides to set the cap variables on the host.

## [0.20.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: draft flow with one question at a time passed. Not verified: a deployed app.)

Origin: #82, found in the 0.11 live check: two parallel threads both took the backlog id HT-006.

### Added

- **Backlog ids can no longer collide.** Three layers: the coordinator names the ids a thread may use when it starts a thread that adds items; a thread without ids reads `docs/BACKLOG.md` and `docs/BACKLOG-DONE.md` on the latest `main` and in every open PR before picking, and again before opening its PR and after a rebase; and the harness health check (run before every commit and in CI) now fails when two items share an id. Changed: `prd-intake`, the app `CLAUDE.md` template (Backlog and roadmap), the app Project-instructions template, and `studio-sync.mjs health`.

**App action:** none needed to stay safe: the health check arrives with the next `harness-sync`. To get the coordinator rule too, paste the updated text of `templates/project-instructions.md` into the app Project's instructions (the coordinator can do this itself).

## [0.19.1] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: covered by the 0.19.x/0.20.0 draft check and the duplicate-ID block check, both passed.)

Origin: #81, found in the 0.11 live check (an app thread opened a draft PR, which can never merge and shows no red check).

### Fixed

- **Apps are told harder not to open draft PRs.** The app template's `CLAUDE.md` "Git workflow", the Project instructions template and the `build-feature` skill now say a draft never merges and fails silently, and add a check: right after creating a PR the thread reads it back and, if it is a draft, marks it ready before handing back.

**App action:** none. Apps get this at their next `harness-sync` once it says `Live check: passed`.

## [0.19.0] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch: covered by the 0.19.x/0.20.0 draft check and the duplicate-ID block check, both passed.)

Origin: issues #67, #68 and #70 (leftovers of closed PR #20). Ale's decision: when an app has its own decision log, product decisions live there.

### Added

- App profile: optional **Decision log** row. Default `docs/PRD.md` "Decisions", so an app that does nothing behaves as today. `prd-intake` writes product decisions there.

### Changed

- App template "Roles": Claude asks one question at a time, each with a recommended answer and one line on why; product decisions go to the decision log, technical ones to the PR description. `prd-intake` asks one question at a time too (it used to allow three). The Project-instructions template says "one at a time".
- App template "Writing for Ale": before saying something is done, check it and say plainly what was not checked.

No **App action**: existing apps get this at their next `harness-sync`; their existing profile has no Decision log row, which means the default. No **Ale action**.

## [0.18.3] - 2026-11-17

Live check: passed 2026-11-17 (studio-scratch-web: all three points passed on 0.18.3. A plain app gets no custom AI warning, the CI, Access model and Storage shape lines look right, and a throwaway AI route was flagged as custom AI. Not verified: `migrate-app` on a real app.)

Origin: #114, live check of 0.18.2 in studio-scratch-web.

### Fixed

- **`inventory` no longer calls the standard AI module a custom design.** A plain app with the `ai` / `ai-web` modules got a "CUSTOM AI DESIGN found" line and a "harness only" recommendation, because the modules' own files take an input in `sample()`. Files that are exact copies of a module's starter are now skipped; an edited copy, an own route or an own usage table is still flagged.

**App action:** none. Apps get this at their next `harness-sync` once it says `Live check: passed`.

## [0.18.2] - 2026-11-16

Live check: passed 2026-11-17 (covered by the studio-scratch-web check of 0.18.3: the CI job names, path filters and stray-backtick fixes look right. Not verified: `migrate-app` on a real app.)

Origin: #114, lessons from migrating chess-coach to 0.18.1.

### Fixed

- **`inventory` spots a custom AI design** (the app's own `/api/coach`-style routes, a `sample()` that takes the app's own input, its own usage table) and no longer reports "ready": it says the `ai` / `ai-web` modules are not a drop-in, lists nothing to switch on, and recommends **harness only** (pull the harness, record the profile, leave the app's AI alone, decide the module swap separately). `migrate-app` has a matching step.
- **`inventory` reports CI job names and path filters**: it lists the app's CI job names (so the ruleset requires the app's own, `CI gate` or the older `check`) and warns when a workflow skips pull requests by file path, which leaves a required check "expected" forever on a notes-only PR. The current pack starters already start on every PR (only pushes to `main` are filtered), so new apps are not affected.
- **`inventory` recognises a table pair** (`coach_usage` next to `ai_usage`) instead of stopping, drops the stray backtick at the end of the access and storage lines, and `migrate-app` now says `pull` may write the user-level `~/.claude/settings.json` and that `new-app` step 10 uses the app's own job name.

**App action:** none. Apps get this at their next `harness-sync` once it says `Live check: passed`.

## [0.18.1] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch and studio-scratch-web: all three points passed in both, the inventory left git status unchanged, and neither the pull nor the start-up check says "merge by hand" any more. Not verified: `migrate-app` on a real app (chess-coach is next). Known cosmetic: the inventory's access and storage lines can end with a stray backtick.)

Origin: #111, found in the 0.18.0 live check in studio-scratch and studio-scratch-web. Fixes to the `inventory` report and the start-up check:

### Fixed

- **`inventory` now states the App profile answers**: whether AI is on or off, who can get in (the access model) and the storage shape, read from CLAUDE.md, with "no row" or "not filled in" when missing.
- **`inventory` has a Modules section**: which modules are on now (user, ai, ai-web, roadmap), which the app's code needs but doesn't have yet, whether the roadmap is the app's own tooling, and the sign-in mode. It no longer reads as "no modules in use" when the user module is on.
- **Inventory and the start-up/sync check now agree**: a pack starter file that already equals the current starter (for example, only its formatting differed from the last install) is no longer reported as "edited here, merge by hand then ack", and `pull` records it as up to date instead of leaving a note. Nobody has to merge by hand for nothing.

**App action:** none. Apps get this at their next `harness-sync` once it says `Live check: passed`.

## [0.18.0] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch and studio-scratch-web: passed apart from the inventory gaps that 0.18.1 fixed. Not verified: `migrate-app` on a real app.)

Origin: #36 (re-scoped by #32). chess-coach and band-studio-os were built before the harness had modules; they need a guided move that changes nothing for their users. Decisions (Ale, 2026-11-16): both keep AI on and invite-only sign-in; chess-coach goes first, band-studio-os only after chess-coach's follow-up PR has merged; each app keeps its own roadmap as it is (the roadmap module is not added).

### Added

- **`migrate-app` skill**: the steps for one existing app, run in its own Project: look first, a written plan for Ale's OK, one migration PR (the way back is reverting it), then one small follow-up PR that must merge by itself.
- **`studio-sync.mjs inventory`**: a read-only report on an app: harness version and packs, which modules its code needs, how its own files differ from the current starters, CI workflows, the sign-in setting, whether its own roadmap files exist, whether its AI usage table is the module's `ai_usage` (a table under another name stops the migration, so allowances aren't lost), and what its App profile lacks. It changes nothing and runs even from an app copy as old as the master script is new, because apps run it from `app-studio`.
- `harness-sync` points an old app to `migrate-app`.

**App action:** only for chess-coach and band-studio-os, one at a time, by running the `migrate-app` skill in their own Projects once this release says `Live check: passed`. Other apps are not affected.

Not verified: the inventory is tested on made-up old apps, not on the real two apps' repos.

## [0.17.5] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch-web: all four checks passed on a fresh thread with no manual installs; Postgres came up on its own and 111 of 111 server tests passed with none skipped. Not verified: a real deploy, and the AI round's auto-merge.)

Origin: #106 and #107, found in the 0.17.4 live check on studio-scratch-web (everything passed, but five things needed a hand fix).

### Fixed

- **A new web app's server tests run in a fresh thread.** Session setup installed only the top-level packages, so `cd server && npm test` failed until the server's were installed by hand. The web pack's `scripts/cloud-setup.sh` now installs them too (#107). Web pack 0.7.1. An existing web app may copy the new file.
- **A new app passes `npm run check` with a longer name.** Filling in the app name could push two starter files past Prettier's line width; `pack add` now formats the filled-in code files with the base pack's Prettier settings (when Prettier is installed; otherwise `npm run format` does it).
- **`health` accepts the AI row as the template shows it.** Writing `` `off` `` or `` `on` `` in backticks no longer reports "must start with on or off"; it is read like the Access model row.
- **The browser tests follow the app's access model.** With no `SIGN_IN_MODE` set, the web e2e helpers and test server read it from `.github/workflows/ci.yml`, so a no-login app's "with no login" specs run in a thread instead of skipping. Setting `SIGN_IN_MODE` by hand still wins.

No **App action**, no **Ale action**.

## [0.17.4] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch-web: all four checks passed for the plain web app and checks 1 to 3 for web + AI + invite-only; the gaps it found were fixed in #106 (0.17.5). Not verified: a real deploy, and the AI round's auto-merge.)

Origin: #34, the pre-check of a new web app (plain, and web + AI + invite-only) built from the packs inside app-studio. Both builds, the server tests (82 and 111) and the browser tests in every sign-in mode passed; two gaps found.

### Fixed

- **A web app's tests now run in a Project thread.** The web pack shipped no database setup, so in a thread the server tests skipped themselves (looking green) and the browser tests failed. The pack now ships `scripts/cloud-setup.sh`, which the existing cloud-setup hook runs: it starts a local throwaway Postgres and sets `DATABASE_URL` and `TEST_DATABASE_URL`; if Postgres isn't installed it says so and CI runs the tests. Web pack 0.7.0. New web apps get it; an existing web app may copy the file, nothing breaks without it. No **App action**.
- **A release is refused when the web host's sign-in setting disagrees with the recorded Access model.** `release-gate` now compares `SIGN_IN_MODE` in `render.yaml` (the live site) and `.github/workflows/ci.yml` with the App profile (invite, open sign-up, no login), so a site can't go live more open than the owner decided, or with the setting still on "choose". Apps without those files are unaffected. No **App action**.

## [0.17.3] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: all three checks passed on 2026-11-16 (the sync no longer mentions `pack add ai` or `pack add user` and holds back no starter files; a temporary `user()` call made the sync say to run `pack add user` first, and it was removed and never committed; `pack add user` worked and `npm run check` passed). Not verified: browser end-to-end tests, and CI on studio-scratch PR #17, which was still a draft.)

Origin: #102, the studio-scratch live check of 0.17.2.

### Fixed

- **The sync guard no longer tells an app without a user module to `pack add user` because of the harness's own platform tests.** Those tests (`tests/unit/*platform*.test.ts`) call every platform method, so an app that never calls `user()` was still held back. They are ignored now, like `src/platform/`; the app's own code and tests still count. No **App action**.

## [0.17.2] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: the re-check on 2026-11-16 passed 4 of 5 steps; the failing step was fixed in #102 (0.17.3). Not verified: browser end-to-end tests.)

Origin: #99, the studio-scratch combined live check of 0.12.0–0.16.0.

### Fixed

- **The sync guard no longer holds back an app that has no AI.** It matched the harness's own old platform code (`src/platform/`) and starter copies the app never edited, and told a non-AI app to `pack add ai`. Only the app's own code counts now.
- **The spec questions no longer contradict each other.** `prd-intake` asks AI, access and storage with no preselected answer and never assumes one; it may add a recommendation when the app's stated purpose points one way, and Ale still answers.
- **`roadmap:check` on a fresh app** says "No docs/BACKLOG.md yet" instead of crashing (roadmap pack 0.1.1; `roadmap:data` also gives a plain message). Existing apps get the fixed script as a starter note at their next sync.
- **No stray settings file in `/tmp`.** An app directly under a system temp folder no longer gets a forwarded `.claude/settings.json` written next to it.

No **App action**, no **Ale action**.

Not verified: the roadmap script was run only by hand on Node's type stripping, not through the app's own `tsx`; the guard and temp-folder fixes are covered by tests, not by a live cloud session yet.

## [0.17.1] - 2026-11-16

Live check: passed 2026-11-16 (covered by the 0.17.2 and 0.17.3 runs in studio-scratch on 2026-11-16. Docs only; not verified separately.)

Origin: #90 (from the #32 audit, findings 6, 7 and 10). Anyone choosing the harness for an app can now see its limits first.

### Added

- **Known limits** in the root `README.md`, `packs/README.md` and the web pack's `STACK.md` (web 0.6.1): one owner and no team; web hosting on one provider (Render) as one server instance with Postgres, with limits and allowances counted in memory; storage as JSON documents by path with no relational data, file uploads or teams; and no AI for anonymous visitors in a no-login app (#98).

Docs only; no **App action**. Not verified: the managed doc reaches apps at their next sync; no live check run yet (fold into the next combined studio-scratch check).

## [0.17.0] - 2026-11-16

Live check: passed 2026-11-16 (covered by the 0.17.2 and 0.17.3 runs in studio-scratch on 2026-11-16 (sign-in modes and the user module). Not verified: browser end-to-end tests.)

Origin: #88 (from the #32 audit, finding 3). A web app could only be invite-only, and every app's platform carried "who is signed in" whether or not anyone signs in. Direction (Ale, #32): the core assumes no feature; the spec phase picks. Decisions (Ale, 2026-11-16): AI in a public app is the app's call, but the harness must raise it; in no-login mode "who is signed in" moves into a module.

### Added

- **Three sign-in modes on the web server** (web 0.6.0), from one setting, `SIGN_IN_MODE`, that follows the App profile's Access model: `invite` (only invited people, today's behaviour), `open` (anyone who signs up: no invite, at most 5 new accounts per address per hour) and `none` (anyone, no login: no accounts, no sign-in screen, every visitor uses `shared/...` documents, per-person paths are refused, document requests are limited per address). An absent setting means `invite`; an unknown one stops the server; start-up logs the mode and `/api/health` reports it, so the page shows or skips the sign-in screen by itself. The sign-in screen offers "Create an account" in open mode.
- **The owner can disable an account** (any mode with accounts): `disable-user <email>` signs it out everywhere and stops it signing in, `enable-user <email>` undoes it, `list-users` marks it. New migration `003_account_disabled.sql`.
- **The `user` module** (0.1.0, `pack add user`): `getPlatform().user()` (the viewer in a Claude artifact, the signed-in person on the web) and its test fake `fakeUser(id)`. Apps with sign-in add it; a no-login app leaves it out.
- **The AI public use decision.** When the App profile says AI is on and the access model is open sign-up or no login, `prd-intake` and `new-app` say that anyone can spend the app's AI and that a usage quota or spend cap is strongly recommended before launch, and ask the owner to decide. The answer goes in a new App profile row, **AI public use** (a cap, or why there is none); `health` reports it missing and `release-gate` stops the release until it is recorded. Allowing AI stays the owner's call.
- `new-app` sets `SIGN_IN_MODE` in `render.yaml` and the app's CI from the access model; a new app's `render.yaml` has no default, so the server won't start until it is set. The app's CI runs the browser tests and the container check in that mode. Browser specs cover invite, open and no-login.

### Changed

- **"Who is signed in" is no longer part of every app's platform** (base 0.9.0, artifact 0.4.0): `Platform` is `hasRuntime`, `db`, `downloads`; `user()` comes with the `user` module, so code that calls it without the module doesn't compile (CI's packs smoke checks this, and adds `web artifact user`). Documents and downloads stay in the core.

**App action** (only for an app made before this release whose code calls `user()`: chess-coach and band-studio-os, planned in #36): at the sync that takes this release, `pull` holds back the new platform files and says the `user` module is missing; run `pack add user` in the same sync. Behaviour doesn't change: without `SIGN_IN_MODE` the server stays invite-only, and the app's own server files are not touched. An app that wants the new modes or `disable-user` merges the web pack's server changes by hand.

Not verified: no existing app was migrated (#36); a real Render deploy in each mode was not run; with no login the `ai-web` module refuses every visitor (its allowance is per person), so AI in a no-login web app needs app-specific work (a site-wide cap) that this release doesn't provide.

## [0.16.0] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

Origin: #89 (from the #32 audit, finding 4). Every app's platform layer (`getPlatform()`) had the AI built in (`sample`, `permissionState`, the AI's types), copied from the Claude artifact API, so an app without AI could still call the AI, and a module could not add a capability without editing base and every adapter. Direction (Ale, #32): the core assumes no feature. Design note on #89, approved by Ale on 2026-11-16, with documents, the signed-in user and downloads kept in the core for now.

### Changed

- **The platform has no AI unless the app adds the `ai` module.** Base (0.8.0) `Platform` is `hasRuntime`, `db`, `user`, `downloads`. The `ai` module (0.2.0) adds `getPlatform().sample()` and `permissionState()` with `src/platform/capabilities/ai.ts`, and brings the AI's types (`src/ai.d.ts`) and test fakes (`fakeAi(answer)`). Without the module, code that calls the AI doesn't compile; with it, existing calls compile unchanged.
- **A module adds a capability without editing another pack's file.** It drops one file in `src/platform/capabilities/`; `nullPlatform`, `fakePlatform()` and the artifact adapter (artifact 0.3.0) read that folder. On the web, a module serves its methods with a provider in `src/platform/web-providers/`: `ai-web` (0.2.0) now ships the page's AI client (`sample` over `/api/ai`, the allowance check behind `permissionState("sample")`, its unit tests), which the web pack (0.5.0) no longer has. The web pack's `web-sse.ts` is now `web-http.ts` (the server call and error helpers). `packs/README.md` has a "Platform capabilities" section.
- `fakePlatform()` takes the members to replace (`fakePlatform({ user })`) instead of an AI answer; with the `ai` module, `fakePlatform()` has a fake AI and `fakePlatform(fakeAi("hello"))` picks its answer.
- **Sync guard.** `pull` holds back pack starter files while the app's code calls a module's capability (e.g. `sample()`) without that module, and says which module to add (`check` says "held back"). It also adds starter files new in a pack the app has, where nothing is in the way; held files come in once the module is added. `pack add ai` on a web app (and `check`) says `ai-web` is needed too. Module `pack.json` fields: `platformMethods`, `alsoWith`.
- CI's packs smoke test also builds `web ai-web` and `artifact ai`, and checks that an AI call fails to compile without `ai` and compiles with it (Ale's tier: it edits `.github/workflows/ci.yml`).

**App action** (only for an app that uses AI and was created before the `ai` module: chess-coach, band-studio-os; #36 plans it one app at a time): at the sync that takes this release, `pull` holds back the new platform files and says so. In the same sync, `pack add ai-web` (web) or `pack add ai` (artifact only); unedited platform files then update by themselves, edited ones are merged by hand from `packs/*/starter/src/platform/`. Then change tests that call `fakePlatform("answer")` to `fakePlatform(fakeAi("answer"))`, delete the seed AI status line (`src/modules/ai.ts`) if the app's page replaced the seed, delete the old `src/platform/web-sse.ts` once nothing imports it, and run `npm run check`. The app's AI keeps working as before: the same calls, the same `/api/ai` requests. An app without AI needs nothing.

Not verified: no existing app was migrated (that is #36), so chess-coach's and band-studio-os's own platform edits were not read; a real Claude artifact runtime and a live web server with AI were not used (the unit tests fake both).

## [0.15.0] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

Origin: #87 (from the #32 audit, finding 9). Every app had the roadmap page generator, `roadmap:check`/`roadmap:data` and a roadmap test, and its CI failed when the backlog had no Roadmap list. Direction (Ale, #32): the core assumes no feature; the roadmap is a process choice.

### Added

- **The `roadmap` module** (0.1.0, `pack add roadmap`): `scripts/roadmap/` (`roadmap.ts`, `cli.ts`), `tests/unit/roadmap.test.ts` and the `roadmap:check` / `roadmap:data` npm scripts, moved unchanged from the base pack. The module's rules are in `.claude/packs/roadmap/STACK.md`.

### Changed

- **A new app starts without the roadmap tooling** (base 0.7.0): no roadmap scripts, no roadmap test, no Roadmap list required, so CI passes without one. `new-app` and `prd-intake` offer the module as a process choice (recommended) and add it only on Ale's yes. The app template's "Backlog and roadmap" section, `prd-intake` step 7 and `test-handoff` apply the Roadmap list only when the module is there.
- Existing apps keep their roadmap files and scripts (starter files are the app's own); nothing changes for them.

No **App action**.

## [0.14.0] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

Origin: #84 (from the #32 audit, findings 5, 6 and 11). The App profile assumed every app uses AI and is private; the spec phase now decides.

### Changed

- The App profile has a **Features** part: **AI** (on or off), **Access model** (only invited people, anyone who signs up, anyone with no login, or whoever the owner shares it with) and **Storage shape** (per-person documents, shared documents, or something else). `prd-intake` asks the three questions one at a time with no preselected answer and records them; the harness never picks them.
- The AI rules (the runtime rule, and the AI items in `reviewer`, `qa`, `planner` and `build-feature`) apply only when the profile says AI is on. The **AI plan** row is required only then; with AI off, any AI code is a blocking review finding.
- The health check fails when AI, Access model or Storage shape is missing, empty or still a placeholder, or when AI is on with no AI plan.
- `release` runs a new gate (`studio-sync.mjs release-gate`) and stops, with a clear message, while the Access model is blank.
- Wording: dropped "voice" from the capability list and the "Ale, as a player" example in the template.

**App action:** each app adds three rows to its App profile table in `CLAUDE.md` (`AI`, `Access model`, `Storage shape`) at its next sync, or its commits are blocked by the health check until it does. chess-coach and band-studio-os record `AI | on` with their existing AI plan, `Access model | only invited people`, and their storage shape (Ale's 2026-11-16 decision: no behaviour change).

## [0.13.1] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

Origin: #85 (from the #32 audit, findings 8 and 12). The artifact pack's App-profile hint named "a Lab-style preview build", a term from one app.

### Changed

- `packs/artifact/managed/STACK.md` now says "an extra preview build". Artifact pack version 0.2.2.
- `core-lint` now also scans packs for one app's own build names (`Lab`, `build:lab`, `dist-lab`) and specific artifact links, so the next one fails CI. Stack words a pack legitimately names (`window.claude`, `modelTier`, `Render`, the 16 MB limit) stay allowed in packs and banned in the core. A test plants "Lab-style" in a pack doc and checks the lint fails.

No **App action**: apps get the reworded line at their next `harness-sync`. To be folded into the next combined studio-scratch check.

## [0.13.0] - 2026-11-16

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

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

Live check: passed 2026-11-16 (studio-scratch: combined 0.12.0–0.16.0 check on 2026-11-16 passed 6 of 8 steps; the failing steps were fixed in #99 (0.17.2). Not verified: browser end-to-end tests.)

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
