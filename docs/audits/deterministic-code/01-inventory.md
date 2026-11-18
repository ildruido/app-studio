# Phase 1 inventory — app-studio harness @ 52fd6a8 (v0.28.1), 2026-11-18
Sizes in bytes (~4 bytes/token). Wiki and docs/archive excluded. Load = when a model or machine reads/runs it.

## A. Always in model context (every turn in the Project that has it)
| File | Size | Loaded by / when |
|---|---|---|
| plugins/studio/templates/CLAUDE.md (becomes the app's CLAUDE.md, 165 lines) | 23.7K | App coordinator + every app thread, every session |
| plugins/studio/templates/project-instructions.md | 5.1K | App Project instructions, every app session |
| docs/studio-project-instructions.md | 3.3K | Studio Project instructions, every studio session |
| Skill descriptions (9 skills, frontmatter only) | ~2K | Every session, for routing |

## B. Skills (SKILL.md body loaded when triggered, by the model)
| Skill | Size | Trigger |
|---|---|---|
| new-app | 14.8K | App Creator starts a new app |
| prd-intake | 7.4K | App Creator describes requirements/changes (also called by new-app step 8) |
| migrate-app | 6.5K | Only when App Creator asks to migrate an old app |
| harness-sync | 5.5K | Pull harness updates into an app |
| release | 5.2K | Cut a release |
| build-feature | 4.2K | Every backlog change (most used) |
| test-handoff | 3.5K | After each release; and when Tester reports |
| harness-idea | 3.2K | File an idea to studio (+ dup-search.mjs 3.5K, ALREADY scripted #173) |
| coherence-review (studio only) | 0.9K + docs/COHERENCE-REVIEW.md 3.8K | Only when Ale asks |

## C. Agents (spawned by build-feature, own context each time)
planner.md 2.0K · qa.md 1.8K · reviewer.md 2.8K

## D. Per-pack managed docs (copied into the app; read by model when pack active)
- STACK.md: base 3.1K, web 5.4K, ai-web 6.6K, artifact 2.4K, ai 1.6K, mirror 2.3K, roadmap 1.3K, user 1.3K
- QA.md: web 1.6K, ai-web 0.7K, artifact 0.9K · REVIEW.md: web 1.2K, ai-web 0.6K, artifact 0.7K, mirror 0.6K · RELEASE.md: web 1.5K, artifact 1.4K, mirror 1.3K
- packs/README.md 9.0K (studio-side reference)
- Pack starter code (~150 files, ts/sql/yml): copied by sync into apps, run by app CI; not read by model unless editing. Out of scope for token review except scripts/ and workflows.

## E. Machine code (runs without model; zero tokens already)
- Hooks: hooks/check.mjs 10.0K (pre-commit/PreToolUse commit gate) · cloud-setup.mjs 2.5K (SessionStart) · pre-commit 0.4K · templates/settings.json (wires SessionStart: cloud-setup + `studio-sync check --warn`; PreToolUse Bash commit check)
- scripts/studio-sync.mjs 91K (cmds: check, release-gate, phase, health, status, release-prepare, changelog, pull, install, pack, inventory, hooks, ack) · studio-sync.test.mjs 97K
- scripts/: tier.mjs 9.0K (PR risk tier), release-check.mjs 3.7K, coherence-lint.mjs 4.8K, core-lint.mjs 2.6K, packs-smoke.mjs 3.5K, studio-env.mjs 7.5K, env-setup.sh 4.1K, routing-test/ (queries.json + run.py; only on Ale's ask), plus *.test.mjs
- CI: .github/workflows/ci.yml 8.3K (jobs tier, tests, check) · wiki-publish.yml 2.1K · pack-level ci.yml/release-tag.yml/harness.yml/deploy.yml/mirror.yml (app-side CI)

## F. Governance / docs (model reads on demand)
- docs/GOVERNANCE.md 17.7K (115 lines, 9 sections) — every studio thread reads it first
- README.md 10.9K · CHANGELOG.md 102K (never read whole since #171) · docs/archive/HANDOVER 9.4K (archive, skip)
- .github/ISSUE_TEMPLATE/harness-idea.yml 1.2K

## G. Already scripted — later phases skip
- #171 `studio-sync changelog [--since]` (sync no longer reads 96K changelog)
- #172 `studio-sync status [--scaffold]` + `release-prepare [--apply]` (release version/changelog chores); release skill steps 2 and 5 use it
- #173 `dup-search.mjs` (harness-idea step 2)
- Already machine-run: `check`, `release-gate`, `phase`, `health`, `inventory`, `pack`, `pull`/`install`, tier + release-check in CI

## H. Rough token weight at risk (for phase prioritisation, no judgement yet)
- Largest always-loaded: app CLAUDE.md template (~6K tokens/turn-session)
- Largest per-trigger: new-app (~3.7K), prd-intake (~1.9K), migrate-app (~1.6K)
- GOVERNANCE ~4.4K read by every studio thread
