# Phase 6 — Synthesis (from INDEX only; nothing filed)

Ranking = tokens saved x how often it runs, then risk. Savings are rough, per run.

| # | Proposed issue | What it does | Safe / judgement | Saving | Owner tier? | Live check? | Coherence review? | Needs first |
|---|---|---|---|---|---|---|---|---|
| 1 | Check if subagents auto-load CLAUDE.md (3·A5) | Verify; if yes, drop "read CLAUDE.md first" from agents, else add `profile show` | judgement (unverified) | 2-6K per agent spawn | no | no | no | - |
| 2 | CI failure summary (3·C2, C1, H2) | CI posts first failing test + file:line; hooks cap failure output; `pr-status` one-liner | safe | 3-10K per CI failure | no | no | no | - |
| 3 | One `backlog` script (2b I1,I3,I4,T5,T6; 2c B1,B2; 4a T3) | next-id, add item/bug, roadmap add, move to Done, start-branch | safe | 1.5-2K per intake/release/feature | no (likely) | no | no | - |
| 4 | Release + sync scripts (2c R1-R3,S1-S4; 5 G4,G5,G7) | `release-cut`, `release-tag-check`, `studio-sync sync/finish`, live-check pass/prompt, PR hand-over skeleton | safe; CI status and wording = judgement | 1.5-2K per release or app sync | likely (release flow) | yes | no | - |
| 5 | Review/QA prechecks + baseline browser checks (3·A1-A4; 4c P4,P5,P6) | `review-precheck`, `qa-run`, generic per-pack Playwright baseline (375px, light/dark, reload...), pack greps, mirror leak check | safe for greps/generic checks; severity = judgement | 2-4K per feature | no (likely) | yes (scratch app) | no | 2 helps |
| 6 | App-creation and intake helpers (2a N1-N9, M1-M6; 2b I2,T2-T4,H1) | `project-report`, `admin-checklist`, `pack-plan`, `profile`, handoff lint, idea-file | safe | 3-4K per new app, 1.5K per intake/migration | no | yes (new-app) | no | 3 (shared bits) |
| 7 | Slim the app template + app project instructions (4a T9,T1,T2,T4; 4b P1-P9) | Split CLAUDE.md into ~2K core + on-demand reference; dedupe with instructions; cut merge-rule block | needs judgement | 2-4K every app session | yes | yes | yes | 3, 4 (so scripts replace prose) |
| 8 | Slim GOVERNANCE (5 G1,G2,G8) | ~2K core + on-demand reference; dedupe section 8 | needs judgement | ~3K per studio thread | yes | no | yes | 4 |
| 9 | Load skill sections on demand (2a N10, 2b I8, 2c R6,S6,S7,B6, 4c P1,P8) | Split big skills into on-demand parts | needs judgement (routing) | 1-2K per run | yes (likely) | yes | yes | 6, 7 |

Leave alone: hooks and ci.yml (already deterministic), 4b P8 (no API to read live text), B4/B5 (GitHub API judgement).

## Order
1 -> 2 -> 3 -> 4 (any order, independent, all cheap) -> 5, 6 -> 7, 8 -> 9. Items 7-9 hold the biggest per-session saving but carry the most risk; do them only after scripts exist so prose can shrink safely.

## Recommendation
File 1-4 now: small, safe, high frequency. Revisit 5-6 after. 7-9 need a plan and your OK each, plus a proposed coherence review (with cost) when they land.
