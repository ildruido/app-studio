# 2c — build-feature (4.2K) + release (5.2K) + harness-sync (5.5K)
Already scripted, skipped: `phase --build-only`, `release-gate`, `release-prepare` (+`--apply`), `changelog`, `check`/`pull`/`health`/`ack`, `ack instructions`.
Saving = tokens of skill text/steps the model no longer reads or reasons about per run. Frequency: build-feature every feature; release every ship; harness-sync every app per harness release.

## build-feature (runs per feature, highest frequency)
- B1 · steps 1-2, 11 · `backlog next|move <id> <column>` (top Ready item, move to In progress/To test). Same script as 2b backlog · safe · ~300
- B2 · step 2 · `start-branch <id> <slug> [--fix]` (switch main, pull, branch name from id prefix, or keep session branch in cloud) · safe · ~200
- B3 · step 6 · `capabilities-diff` compares platform-layer capability calls with the App profile Capabilities line, flags drift · safe for detection, wording of the note = needs-judgement · ~250
- B4 · step 7 · `verify` (check + e2e specs for changed areas) is 2a·N6; mapping changed files to specs · needs-judgement · ~200
- B5 · step 10 · `pr-ready` reading back draft:false, merged vs auto-merge choice. Needs GitHub API (MCP in cloud), not plain script · needs-judgement · ~300
- B6 · step 0 duplicates what the `phase` command already prints; trim wording · safe · ~100
- Not scriptable: plan, tests-first, bug reproduction, changelog wording, review (judgement).

## release (runs per ship)
- R1 · step 1 · extend `release-gate` with git parts: on main, pulled, clean tree, Unreleased has entries · safe · ~350 (CI-green check + workflow_dispatch need the GitHub API: needs-judgement/not plain script)
- R2 · steps 3-5, 7 · `release-cut --version X.Y.Z`: branch, `npm version`, changelog apply, `npm run check`, commit message · safe (merge step stays model) · ~500
- R3 · step 8 · `release-tag-check vX.Y.Z` (ls-remote; detect whether `release-tag.yml` exists; print the old-app fallback only then) · safe · ~350
- R4 · steps 9-10 · `release-targets` lists the Release steps from stack notes + each pack RELEASE.md in order · safe to list, executing/ship decisions = needs-judgement · ~300
- R5 · step 12 · `release-summary` prefills version, links, capability change, targets-with-nothing-new skeleton · safe skeleton, plain-words wording = needs-judgement · ~300
- R6 · step 0 and step 11 fallback text: drop duplicated phase text; load the no-workflow fallback only when needed · needs-judgement (routing) · ~300
- Not scriptable: choosing the version, tidying changelog wording, telling the App Creator.

## harness-sync (runs per app per harness release)
- S1 · steps 1-4 · `studio-sync sync`: one command = studio pull, check, pull, print changelog; stops on "not live-checked yet" · safe · ~600 (best in this slice)
- S2 · step 5 · when starter files are held back, print the exact `pack add <module>` command and diff path; the merge itself = needs-judgement · safe for the printout · ~300
- S3 · step 6 · `ideas-fixed`: list closed app-studio issues naming this app (label, closing release). Needs GitHub token/API; in cloud the model uses MCP · safe if API reachable · ~500
- S4 · steps 7-8 · `sync --finish`: health, ack instructions after confirmation, commit message `chore(harness): sync studio vX.Y.Z` · safe · ~200
- S5 · step 3 (edited files: send as idea vs move to App profile) · needs-judgement
- S6 · studio-dir lookup paragraph duplicates the script's own help; trim · safe · ~200
- S7 · "Add a stack pack" section loaded only on demand; the web ci.yml replacement as `pack add web --replace-ci` · safe for the script; split = needs-judgement (routing) · ~400

## Slice total
~1.5-2K per feature (B), ~1.5-2K per release (R), ~1.5-2K per app sync (S); all high frequency, comparable to 2b. Shared building blocks: `backlog` (2b), `verify` (2a), a single `sync` wrapper, a `release-cut` wrapper.
