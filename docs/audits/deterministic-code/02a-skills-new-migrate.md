# Phase 2a — new-app + migrate-app (read-only analysis, v0.28.1)

**Frequency:** new-app runs once per app (plus once at "start building"); migrate-app is one-off per legacy app (rare, likely 0-2 more runs ever). So per-run savings are real but the total is small; value is mostly fewer mistakes in long, fiddly sequences. Savings are rough tokens per run (output + re-reading), not per month.
Already scripted, skipped: install, pack add, health, check, inventory, pull, ack, phase.

## new-app
| id | step | what it does today | → code | class | saving |
|---|---|---|---|---|---|
| N1 | 1 | Look at repos beside app-studio; classify: no repo / empty repo / repo with content / not on harness env | `studio-sync setup-check` prints the case and the next action | safe | ~300 |
| N2 | 2,4,7 | Turn answers (stack decided?, artifact/web, AI on?, access model, user module, roadmap) into pack list and commands (`pack add web artifact`, `ai`/`ai-web`, `user`, `roadmap`, SIGN_IN_MODE value) | `studio-sync pack-plan --answers …` outputs exact commands. Asking the questions stays with Claude | safe (mapping); questions need judgement | ~600 |
| N3 | discovery, 4 | Discovery path: install only, then copy harness.yml and .nvmrc | `install --discovery` flag does the copy | safe | ~250 |
| N4 | 5 | Fill App profile rows; discovery fills TBD rows | `profile set key=value` / `profile init --discovery` writes the TBD rows. Merging into an existing CLAUDE.md stays judgement | safe (TBD/known rows); needs-judgement (merge) | ~500 |
| N5 | 6 | Check CI skips Markdown-only/.claude-only and version-bump browser runs | extend `check` to assert the workflow's path filters | safe | ~200 |
| N6 | 9 | Run npm check, e2e, sync check, health, collect results | `studio-sync verify` runs them in order and prints one summary | safe | ~300 |
| N7 | 10 | Admin repo-settings click list (default branch, merge methods, ruleset, required checks) | `admin-checklist --repo --checks` prints the fixed text. Verification stays via enable_pr_auto_merge | safe | ~700 |
| N8 | 12 | Project report: fill project-instructions template, fixed model/effort settings, Admin checklist | `project-report --name --repo` generates it. The proposed "What do you want to work on?" sentence stays Claude's | safe (all but the sentence) | ~900 |
| N9 | start building | Count remaining TBD rows, flip Phase | already covered by `health`/`phase`; just add a `start-building` wrapper (pack add + health) | safe | ~300 |
| N10 | (structure) | Skill is 14.8K chars loaded whole every run; discovery and start-building sections apply to only some runs | Split into on-demand sub-files. Not code, but the biggest single token cut | needs-judgement (routing risk, needs coherence review) | ~1,000 |

## migrate-app
| id | step | what it does today | → code | class | saving |
|---|---|---|---|---|---|
| M1 | 1 | Pull app-studio, check newest release says Live check: passed, run inventory | `inventory` preflight does the pull and release check, stops with a clear message | safe | ~200 |
| M2 | 2 | Draft the plan: modules to switch on, differing files, CI job names for the ruleset, paths-filter warning | `inventory --plan` prints a plan skeleton from its findings; wording for the App Creator stays Claude's | mostly safe | ~600 |
| M3 | 3 | Pick commands: `pack add ai` vs `ai-web`, `user` if user() calls found, never `roadmap`; profile defaults (AI on, invite-only, storage) | `migrate-plan` outputs exact commands and profile values; storage shape needs judgement | safe (commands); needs-judgement (storage shape) | ~400 |
| M4 | 4,5 | Stop conditions: custom AI design, usage table not `ai_usage` | inventory already flags; make it exit non-zero with a STOP code so it can't be skipped | safe | ~300 (plus safety) |
| M5 | 6 | PR title and hand-over skeleton (version, inventory summary) | script prints the title and skeleton; "what wasn't verified" stays Claude's | safe | ~200 |
| M6 | 7 | Confirm auto-merge and ruleset are set up via the proof PR | reuse N7 checklist | safe | ~150 |
| M7 | 3 | Hand-merge files that differ from pack starters | no: needs judgement | needs-judgement | 0 |

## Notes
- Highest value per effort: N8, N7, N2 (all fixed text or pure mapping, shared by migrate via N7/M3).
- N10 beats all code ideas on tokens but touches routing, so it would need the coherence review (the App-Studio Owner's yes first).
- Whole slice if all safe items done: roughly 3-4K tokens saved per new app, ~1.5K per migration. Low total; worth it mainly for reliability.
