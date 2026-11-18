# Deterministic-code analysis — INDEX (keep ≤40 lines)
**Objective:** find parts of the app-studio harness (human-language steps that cost tokens each run) that can safely move to deterministic code. Read-only: no PRs/issues, no wiki.
**Rules for every step:** read ONLY this INDEX + your own slice; write your own detail file `NN-<slice>.md` here; add ONE line per finding below; update the status row; never read other detail files. Mark each finding `safe` or `needs-judgement` + rough saving (tokens/run). Skip what is already scripted (#171 changelog excerpt, #172 status/release-prepare, #173 dup-search). Stop and hand back when your slice is done.
**Repo checked out at:** /home/user/app-studio (v0.28.1). Full inventory: `01-inventory.md` (only needed for sizes/triggers; grep it, don't read whole).

## Status
| Phase | Slice | Status |
|---|---|---|
| 1 Inventory | all | done → 01-inventory.md |
| 2a Skills | new-app (14.8K) + migrate-app (6.5K) | done → 02a-skills-new-migrate.md |
| 2b Skills | prd-intake + test-handoff + harness-idea | done → 02b-skills-intake-handoff-idea.md |
| 2c Skills | build-feature + release + harness-sync | done → 02c-skills-build-release-sync.md |
| 3a Agents | planner, qa, reviewer | done → 03-agents-hooks-ci.md |
| 3b Hooks + CI | hooks/*, ci.yml, settings.json, scripts overlap | done → 03-agents-hooks-ci.md |
| 4a Template | templates/CLAUDE.md (23.7K, every session) | done → 04a-template.md |
| 4b Templates | project-instructions.md, studio-project-instructions.md | done → 04b-project-instructions.md |
| 4c Pack docs | packs/*/managed STACK/QA/REVIEW/RELEASE | done → 04c-pack-docs.md |
| 5 Governance | GOVERNANCE.md + release flow | done → 05-governance.md |
| 6 Synthesis | rank findings from INDEX only; propose issues | done → 06-synthesis.md (nothing filed) |

## Findings (one line each: id · where · what → script · safe/needs-judgement · saving)
- 2a·N8 · new-app step 12 · `project-report` generates instructions/settings/Admin checklist · safe (not the outcome sentence) · ~900
- 2a·N7 · new-app step 10 (+migrate M6) · `admin-checklist` prints fixed repo-settings clicks · safe · ~700
- 2a·N2 · new-app steps 2/4/7 · `pack-plan` maps answers to pack commands/SIGN_IN_MODE · safe · ~600
- 2a·N4 · new-app step 5 · `profile set/init --discovery` · safe (TBD rows), needs-judgement (CLAUDE.md merge) · ~500
- 2a·N1,N3,N5,N6,N9 · new-app setup-check, discovery install flag, CI path assert, `verify`, start-building wrapper · safe · ~200-300 each
- 2a·N10 · new-app structure · split discovery/start-building into on-demand files · needs-judgement (routing; coherence review) · ~1,000
- 2a·M1-M6 · migrate-app preflight, plan skeleton, module commands, STOP codes, PR skeleton · safe (storage shape + wording judgement) · ~150-600 each; migrate runs rarely
- 2a total: ~3-4K tokens per new app, ~1.5K per migration; low frequency, so value is mostly reliability

- 2b·I1,I3,I4,T5,T6 · prd-intake/test-handoff backlog edits · one `backlog` script (next-id across main+open PRs, add item/bug skeleton, roadmap add, move to Done with version) · safe · ~250-600 each, runs every intake/release
- 2b·T2,T3,T4 · test-handoff A1-A5 · `test-items`, `handoff-header`, `handoff-lint` (step limits, Do/Expect, closing line) · safe (which target changed = needs-judgement) · ~200-400 each
- 2b·I2 · prd-intake Features · reuse `pack-plan` from 2a·N2 · safe · ~500 shared
- 2b·I8 · prd-intake Features section (~2.2K) · load on demand only when Features rows blank · needs-judgement (routing; coherence review) · ~1,500 per later intake
- 2b·H1 · harness-idea step 3 · `idea-file` prefills title/headings/app name/version · safe · ~400, rare
- 2b total: ~1.5-2K per intake, ~1.5K per release handoff; high frequency, so best value so far
- 2c·S1 · harness-sync steps 1-4 · `studio-sync sync` wraps pull/check/pull/changelog, stops on live-check pending · safe · ~600 per app sync
- 2c·R2,R3 · release steps 3-5,7,8 · `release-cut --version` (branch, npm version, changelog apply, check, commit) and `release-tag-check` · safe · ~500 / ~350 per release
- 2c·R1,R4,R5 · release preconditions (git parts), target steps list, summary skeleton · safe for scripted parts; CI status/workflow_dispatch/wording = needs-judgement · ~300-350 each
- 2c·B1,B2 · build-feature `backlog next|move` (reuse 2b) and `start-branch` · safe · ~300 / ~200 per feature
- 2c·B3,S2,S3,S4 · capabilities-diff, held-back pack printout, ideas-fixed lookup (needs API), sync --finish · safe (B3 note wording judgement) · ~200-500
- 2c·B5,B4 · PR ready/merge choice, e2e-to-changed-area mapping · needs-judgement (GitHub API) · ~200-300
- 2c·R6,S7,S6,B6 · trim duplicated text / load fallback and add-pack sections on demand · needs-judgement (routing; coherence review) · ~100-400
- 2c total: ~1.5-2K per feature, per release and per app sync; all high frequency

- 3·A3 · qa step 3 exploratory checks · generic per-pack Playwright baseline spec (375px scroll, light/dark, reload, focus, capability missing), also runs in CI · safe for generic checks · ~1,000-2,000/feature
- 3·A1,A2,A4 · reviewer Process/Security greps, qa build+e2e+size, criterion-id coverage · `review-precheck`, `qa-run`, AC-id convention · safe (severity, path→spec mapping, convention = needs-judgement) · ~300-700 each/feature
- 3·A5 · all agents "read CLAUDE.md first" · verify if subagents auto-load it; else `profile show` prints App profile only · needs-judgement (unverified) · ~2-6K per agent spawn
- 3·C2 · CI failures · job-summary with first failing test/file:line instead of reading logs · safe · ~3-10K per CI failure
- 3·H2,C1,A6,C3 · cap hook failure output to a summary, `pr-status` one-liner, reply-format lint, derive packs-smoke list · safe/needs-judgement · ~100-800 each
- 3 note: hooks (check.mjs, cloud-setup, pre-commit, settings.json) and ci.yml are already deterministic; little left to move there
- 3 total: ~2-4K per feature (+up to 8-14K if A5 holds), ~3-10K per CI failure; all high frequency
- 4a·T9 · whole template · split into ~2K core + on-demand `docs/HARNESS.md` reference (cloud, harness, versioning, merge detail, models) · needs-judgement (skills cite sections; coherence review) · ~3-4K every session
- 4a·T1,T4 · Cloud sessions fallback + Harness skill/hook lists · fallback printed by session hook only when env not loaded; lists derivable from lock.json/settings.json · safe · ~700 / ~550
- 4a·T2 · merge-rule block (~1.2K) · cut to ~5 lines, hook already enforces, `pr-status` one-liner · needs-judgement · ~700-900
- 4a·T3 · Backlog/roadmap · id rule → `backlog next` (safe, after 2b); roadmap text to roadmap pack doc (judgement) · ~250 + ~500
- 4a·T5,T6,T7,T8 · Models/threads dup of project instructions (unverified), CI/commands prose, profile prose, commit-msg lint · mixed · ~150-600 each
- 4a total: ~2-4K per session in every app session; highest frequency in the harness
- 4b·P1,P3,P5 · app/studio project instructions · drop text duplicated with CLAUDE.md (PR subscribe bullet, harness-loaded fallback, backlog-id rule via `backlog next`) · mostly safe once 4a·T1/2b land · ~60-150 each per thread start
- 4b·P2,P4,P9,P6 · draft-PR rule (check via pr-status), "point don't repeat" shortened to studio wording, merge-by-tier bullet, models/threads dup · needs-judgement (wording change = sync reminder in every app + live check) · ~60-130 each
- 4b·P8 · studio has no instructions-drift script (apps have `instructionsHash`); diff of pasted live text vs template · needs-judgement (no API to read live text) · ~2-3K per flagged sync, rare
- 4b total: files are mostly model-read policy; realistic trim ~300-500 tokens per app thread/coordinator turn, ~250 studio; batch with 4a trims
- 5·G1,G2,G8 · GOVERNANCE.md (4.4K, read by every studio thread) · split into ~2K core + on-demand reference (sections 1,2,6,9 + CI prose), dedupe section 8 with project instructions · needs-judgement (owner tier; section numbers cited; coherence review) · ~2.5-3K per studio thread
- 5·G4,G5 · release live-check flow · `live-check-pass` flips pending→passed in changelog; `live-check-prompt` skeleton for Ale's scratch prompt · safe (scenario wording = judgement) · ~300-600 per release
- 5·G3,G7,G6 · PR merge decision one-liner (tier/check/mergeable/owner-ok), PR hand-over skeleton, issue-close trail text · safe for text/decision table, API delivery needs-judgement · ~150-800 each
- 5 note: enforcement already in code (tier, release-check, owner-ok, ci-guard); GOVERNANCE is mostly read-cost, not missing code
- 5 total: ~3K per studio thread start (G1), ~1-2K per release/PR from scripts
- 4c·P4 · pack QA checklists (web/artifact/ai-web) · executable items become pack Playwright/CI specs (reuse 3·A3); doc keeps only human-judgement items · safe (sign-in wording = judgement) · ~400-700/feature + reliability
- 4c·P5 · pack REVIEW greps (window.claude outside platform, fetch outside platform, SQL, shipped-migration edit, API.md drift, mirror public-tree leak) · per-pack rules in `review-precheck` (reuse 3·A1) · safe for greps, severity = judgement · ~300-600/review; mirror leak check = best value
- 4c·P6 · pack RELEASE steps · `release-verify` per pack (artifact build/size/version, mirror run + public tag) + mirror Admin steps via `admin-checklist` (reuse 2a·N7) · safe; web live-host steps = needs-judgement (no app ever deployed) · ~200-400/release
- 4c·P2,P3 · duplicated AI-public-use text across web/ai-web STACK; "What it adds" tables duplicate pack.json (`pack show`) · P2 safe, P3 needs-judgement · ~250 / ~100-400 each
- 4c·P1,P8 · ai-web endpoint contract (~750 tokens) generated into API.md from code; reference sections moved to on-demand file · needs-judgement (routing; coherence review) · ~700-1,000 per AI feature / ~1-2K per web+AI session
- 4c·P7,P9 · web post-test cleanup note, profile capability lines · P7 judgement (~100), P9 already covered by 2c·B3
- 4c total: ~1-2K per feature plus ~300 per release; docs are short, value mostly reliability. Not verified: when/how pack docs are loaded.

## Next step reads
All phases done. Read 06-synthesis.md; the owner decides which proposed issues to file.
