# Phase 2b: prd-intake (7.4K), test-handoff (3.5K), harness-idea (3.2K)
Skipped: harness-idea step 2 (dup-search, scripted in #173). Frequencies are estimates: prd-intake runs per feature request (often), test-handoff per release (often), harness-idea rarely.

## prd-intake
| id | step | what it does | class | saving/run | freq |
|---|---|---|---|---|---|
| I1 | Steps 1 (ids) | Pick next backlog ids: fetch origin, read BACKLOG + BACKLOG-DONE on main and in every open PR, take max+1; recheck before PR | `next-backlog-id <XX>` script. safe | ~500 (avoids reading 3+ files) | every intake |
| I2 | Features / module naming | Map access model/AI/storage answers to modules + SIGN_IN_MODE (invite/open/none; user module rule; AI public-use trigger) | `pack-plan` (same as 2a·N2; reuse it). Questions and wording stay model. safe | ~500 shared with N2 | new app / feature change |
| I3 | Step 5/6 skeleton | Insert backlog item template with next id, PRD change-log line with today's date | `backlog-add <XX> "<title>"` writes the skeleton; model fills criteria. safe | ~300 | every intake |
| I4 | Step 7 (roadmap place) | If roadmap module exists, add id to Roadmap Now/Next/Later; create section if missing | `roadmap add <id> <lane>`. `npm run roadmap:check` already validates, so only the write is manual. safe | ~250 | per intake on roadmap apps |
| I5 | Step 7 (Ready vs Backlog) | Move to Ready only if no open questions | needs-judgement | 0 | |
| I6 | Step 8 (commit/PR) | Branch name, `docs(prd):` commit, PR | shared with release/PR helper if one exists. safe | ~200 | |
| I7 | Doc-import, ambiguity, rules check, step 2-4 | Map doc to PRD, find open questions, check rules | needs-judgement. keep in model | 0 | |
| I8 | Structure | The "Features" section (~2.2K) only matters when Features rows are blank, yet loads on every intake: move to an on-demand file | needs-judgement (routing; coherence review) | ~1,500 on non-first intakes | most intakes |

## test-handoff
| id | step | what it does | class | saving/run | freq |
|---|---|---|---|---|---|
| T1 | A0 phase check | Already one command (`studio-sync phase --build-only`) | already scripted | 0 | |
| T2 | A1 collect | List To test items and their criteria from BACKLOG.md | `test-items` prints items + criteria. safe | ~400 | every release |
| T3 | A3 target/version header | Build the "how to reach the build" header: release/preview link and version from App profile + lock; which targets changed | `handoff-header` (link, version). Which target shows the change = needs-judgement. safe/needs-judgement | ~300 | every release |
| T4 | A2/A5 limits | Enforce max 7 steps per item, 15 combined, closing line present | `handoff-lint <file>` checks counts and Do/Expect pairs. safe | ~200 and catches drift | every release |
| T5 | B1 move to Done | Tick criteria, move item to BACKLOG-DONE with version, leave title line, drop roadmap id | `backlog-done <id> <version>` does all file moves. Decision of which steps pass stays model. safe | ~600 | every test report |
| T6 | B2 bug skeleton | Create bug item at top of Ready with next id and template | `backlog-add --bug` (reuse I3). safe | ~250 | per failure |
| T7 | B4 commit/PR | Commit message `docs(backlog): record test results for vX.Y.Z` | shared with I6. safe | ~150 | |
| T8 | Writing script steps, unclear results | Plain English Do/Expect, asking the Tester | needs-judgement | 0 | |

## harness-idea
| id | step | what it does | class | saving/run | freq |
|---|---|---|---|---|---|
| H1 | Step 3 issue creation | Compose title prefix, label, body headings with app name + harness version (from lock.json), then open issue | `idea-file --area X --title ...` prefills app name, version, headings and prefix; model supplies the free text. safe (posting needs GitHub tool, so script prints body) | ~400 | rare |
| H2 | Step 1, 4, 5 | Is it harness? change nothing, tell the App Creator | needs-judgement / wording | 0 | |
Skill is already small (3.2K); little left to save.

## Totals
~1.5-2K per intake (I1+I3+I4), ~1.5K per release handoff (T2-T5), ~0.4K per idea. Frequent runs make I1, T5, I3 the best value, and the backlog-file helpers (I1, I3, I4, T5, T6) could be one `backlog` script with subcommands, which also protects the id/Done-move rules from drift. I8 is the largest single saving but needs routing care.
