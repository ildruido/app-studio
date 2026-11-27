# Skills coherence review

The judgement part of keeping app-studio's skills, agents, app template and module docs coherent. The cheap, mechanical part runs by itself on every PR (`scripts/coherence-lint.mjs`, inside the required `check`). This review is run **only when the App-Studio Owner asks**.

## When it is proposed (never run on its own)

After a change to any of: `docs/GOVERNANCE.md`, a skill's behaviour or description, the app template's instructions (`plugins/studio/templates/`), or the coordinator routing. The coordinator (or the thread that made the change) **proposes** a run in one line with its cost, taken from "Last run" below. It is executed only after the App-Studio Owner says yes in that thread. A scheduled run is deliberately not used: it would cost usage whether or not anything changed.

## Steps

1. **Run the cheap check first:** `node scripts/coherence-lint.mjs`. Fix what it finds before reading anything.
2. **Read everything apps receive, in one thread** (the step that found the real problems in both reviews): the app template, every skill and agent of the core and of each module, and each module's managed docs, against GOVERNANCE and against each other. It is about 250 KB, so one thread holds it all, and the contradictions sit between files. Run the checks in `docs/audits/harness-audit.json` (`coherence.checks`): scope and roles, contradictions, modules against the core, who tells the App Creator, and rules said twice.
3. **Apply the lenses and checks below to every finding** before ranking it.
4. **Optional, costs usage, ask again before running:** the routing test, `scripts/routing-test/run.py`. It builds a fixture app from this repo (all skills loaded together, the core's and the ones modules ship, the app template and coordinator routing, a small backlog) and sends the prompts in `queries.json` (77 on 2026-11-27: casual user phrasing and coordinator-style briefs, plus read-only negatives). Requests for a discovery skill run in a second fixture that is still in discovery. Each run leaves its score and misses in `scripts/routing-test/results/<date>.json`: commit that file with the PR. Use it after description or routing changes, not per PR. Notes: run 3 workers at most; an error is not "no skill"; review misses by hand because a label can be wrong; add a query whenever a real routing miss is reported; keep `queries.json` in step with the template.
5. **Write the result** as a short report: findings ranked by product impact, each with its verdict, the fix, its tier, whether it needs a live check, and **what was not verified**. Fix wording, pointers and anything a lint rule can hold in the review's own PR (an issue and a thread each would cost more than the fix); file as `studio-backlog` issues only what changes behaviour, needs a design or needs a product decision.
6. **Feed the run back:** update "Last run" below, drop or merge a check that found nothing twice running, add a check for a kind of finding that was only spotted by reading, and turn every mechanical finding into a `coherence-lint.mjs` rule with a test.

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

The areas to sweep: apps vs app-studio scope; sync (sender side vs receiver side: pinned copy, `lock.json`, live-check gate); ideas (proposer: an app files `harness-idea` and may not edit the harness; triager: the studio coordinator accepts, merges or declines and leaves the trail comment); governance (evolving app-studio vs building apps); roles.

Verdict per finding: Confirmed, Refined, Downgraded, Wrong (scope mix-up), Added.

## Keep out of the review

The full skill-creator loop over all skills (hundreds of calls) and scenario dry-runs as proof. Dry-runs are fine as a fixed list for stop rules. Skill changes still follow GOVERNANCE section 5.

## Running it as a workflow

Steps 2-3 also exist as the saved workflow `.claude/workflows/coherence-review.js` (one agent per check and one for the report; rough cost in its description), and the deterministic-code audit as `harness-audit.js`. Both read their checks and slices from `docs/audits/harness-audit.json`, passed as the workflow's `args`. Same rule: run only after the App-Studio Owner says yes. Prefer one thread reading by hand while the text fits in one context: each workflow agent reads most of the same files again and cannot see a contradiction that spans two checks. Use the workflow when a read independent of the thread that made the changes is wanted.

## Last run: 2026-11-27 (issue #364, before 1.0, with the discovery, research and human-docs modules)

- **Cost, for the next one-line proposal:** one thread, no helper agents, about 250 KB (roughly 65K tokens) of rule text read once, fixes included in the same session. The routing test is 77 short calls on the standard thread model per run; this review used about 190 because the fixture and the scoring were being repaired. Token counts are estimates: the thread could not meter itself.
- **Found by reading, fixed in the same PR:**
  - a discovery document's PR waits for sign-off while the always-loaded merge rule says "merge on green"; nothing said the wait is an exception, who merges a late approval, or that studies do not wait;
  - the merge rule named a required check a discovery app does not have;
  - four skills still sent test scripts, plans or questions "through the coordinator" after the template moved them into the thread;
  - two skills pointed at sections of `CLAUDE.md` that had moved to `harness.md`;
  - five places described a model by strength ("a strong model", "the strongest model the session offers"), one of them starting the strongest model without being asked;
  - the template said the coordinator "proposes" the next discovery document without saying whether it waits;
  - the draft-PR rule is opposite in the two scopes and neither said so;
  - the discovery folder is called history although the decision log in it stays live; the handoff skill read app-studio's pack list with no fallback; the module's STACK.md repeated its WORKFLOW.md.
- **Checks that found nothing:** scope leaks and roles. Merged into one check and kept (its entry says why).
- **Missed by the old checks, now covered:** "modules against the core" and "who tells the App Creator" are new checks; `copied-rules` became `said-twice` and covers module docs.
- **Now caught by `coherence-lint.mjs`:** rule 9 (a pointer to a `CLAUDE.md` section the template does not have) and rule 10 (a model described by strength).
- **Routing test** (every core and module skill loaded together, 77 requests, one run each): 73 of 77 without the template and 70 of 77 with it handed to each run (`scripts/routing-test/results/2026-11-27.json`). **No request reached a wrong skill in either run**, and every request for a module skill (discovery, research, human-docs) was right. Every miss is a build or sync request where the model looked at the repo before loading the skill (a traced run read `build-feature` on its third move). The request #405 found never reaching `exit-gate` now does, 3 of 3, once the discovery requests run in a fixture that is in discovery. Read the score as: wrong-skill routes must be zero; "looked first" misses of up to about one in ten are the noise of a bare fixture (70 to 76 of 77 over four runs with unchanged descriptions).
- **Not verified:** whether a build thread in a real app loads `build-feature` before it starts work (the fixture has no code, so the model explores it; a fixture with a small real app is a follow-up issue); a headless run in the cloud container does not load the fixture's `CLAUDE.md`, so `run.py` now hands it over as system prompt text, which is close to a real thread but not the same; no skill was run end to end; the wording changes were not tried in a live Project (checked by hand at the 1.0 checkpoints).
