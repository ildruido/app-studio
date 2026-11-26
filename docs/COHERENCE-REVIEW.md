# Skills coherence review

The judgement part of keeping app-studio's skills coherent. The cheap, mechanical part runs by itself on every PR (`scripts/coherence-lint.mjs`, inside the required `check`). This review is run **only when the App-Studio Owner asks**.

## When it is proposed (never run on its own)

After a change to any of: `docs/GOVERNANCE.md`, a skill's behaviour or description, the app template's instructions (`plugins/studio/templates/`), or the coordinator routing. The coordinator (or the thread that made the change) **proposes** a run in one line with its rough cost. It is executed only after the App-Studio Owner says yes in that thread. A scheduled run is deliberately not used: it would cost usage whether or not anything changed.

## Steps

1. **Run the cheap check first:** `node scripts/coherence-lint.mjs`. Fix what it finds before reading anything.
2. **Read the skills against GOVERNANCE** (the step that found the real problems in the 2026-11-17 review). Look for: studio-side procedure shipped to apps, apps pointed at the studio's path instead of `harness-idea`, steps that contradict GOVERNANCE or the app template, and rules copied into a skill that already live in GOVERNANCE (a copy drifts).
3. **Apply the lenses and checks below to every finding** before ranking it.
4. **Optional, costs usage, ask again before running:** the routing test, `scripts/routing-test/run.py`. It builds a fixture app from this repo (all skills loaded together, the core's and the ones modules ship, the app template and coordinator routing, a small backlog) and sends 51 unprimed prompts (casual user phrasing and coordinator-style briefs, plus read-only negatives). A first-move score of about 95% was reached on 2026-11-18. Use it after description or routing changes, not per PR. Notes: run 3 workers at most; an error is not "no skill"; review misses by hand because a label can be wrong; add a query whenever a real routing miss is reported; keep `queries.json` in step with the template.
5. **Write the result** as a short report: findings ranked by product impact, each with its verdict, the fix, its tier, whether it needs a live check, and **what was not verified**. File the fixes as `studio-backlog` issues; do not fix them inside the review.

## Lenses (keep app-studio and apps apart)

| | app-studio (the harness) | an app |
|---|---|---|
| Rulebook | `docs/GOVERNANCE.md`, `docs/studio-project-instructions.md` | the app template (`CLAUDE.md`, `project-instructions.md`) and the app's own decision log |
| Who runs the text | studio threads follow GOVERNANCE; skills are content there | the app's Claude runs the skills |
| Merging | tiers, `owner-ok`, live check | the app's own merge rules |

For every finding ask:
1. Whose rulebook applies to the actor in the finding?
2. Who reads this text: an app Claude (applier) or a studio thread (maintainer)?
3. Is the text shipped to apps, or does it only live in app-studio?
4. Does the "contradiction" compare two rules of the same scope?
5. Which role is named (App-Studio Owner, App Creator, Tester, Admin) and does it exist in that scope? "Owner" inside an app is not the App-Studio Owner.

The five areas to sweep: apps vs app-studio scope; sync (sender side vs receiver side: pinned copy, `lock.json`, live-check gate); ideas (proposer: an app files `harness-idea` and may not edit the harness; triager: the studio coordinator accepts, merges or declines and leaves the trail comment); governance (evolving app-studio vs building apps); roles.

Verdict per finding: Confirmed, Refined, Downgraded, Wrong (scope mix-up), Added.

## Keep out of the review

The full skill-creator loop over all skills (hundreds of calls) and scenario dry-runs as proof. Dry-runs are fine as a fixed list for stop rules. Skill changes still follow GOVERNANCE section 5.

## Running it as a workflow

Steps 2-3 also exist as the saved workflow `.claude/workflows/coherence-review.js` (about 5 agents, rough cost in its description), and the deterministic-code audit as `harness-audit.js`. Both read their checks and slices from `docs/audits/harness-audit.json`, passed as the workflow's `args`. Same rule: run only after the App-Studio Owner says yes.
