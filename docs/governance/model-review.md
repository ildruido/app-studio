# Model review: keep the harness as small as the model allows

Guidance only. No CI check and no warning enforces it (App-Studio Owner, 2026-11-25). Every part of the harness encodes an assumption about what the model can't do alone; a better model makes some of those assumptions false.

## When

- A new Claude model becomes the standard thread model, **or**
- about 15 releases have passed since the last review (the last one is named in the table at the end).

The coordinator proposes the review in **one line with its measured cost** (the last run: one thread, about an hour, 15 short headless runs, 14 of them on the standard thread model, about 3 US dollars of use, no live-check scenario), and it runs only after the App-Studio Owner says yes (section 4: Claude recommends, the Owner decides).

## What

**The removal test**, only for the workaround list below. Per row: turn the workaround off in a scratch app, run the same task with and without it, and keep the removal only if the result is as good. Test only what the new model plausibly fixes.

- **Test on the standard thread model**, whatever model the review thread itself runs on: a workaround can go only when the model that app threads normally use no longer needs it.
- **How a row is run** (what the first review did; no live-check scenario covers a workaround, so none is used):
  1. Build a scratch app outside the repo: `node scripts/studio-sync.mjs install --app <dir> --live-check`, then `pack add artifact`, fill the App profile with two or three domain rules, and add one backlog item with numbered acceptance criteria.
  2. For a review row, commit a small feature on a branch with **known defects** (the first review seeded 10: a broken domain rule, an off-by-one, unsafe HTML, a missing confirmation, weak tests, dead code and so on) and write the list down before any run.
  3. Run each arm headless from the scratch app, on the standard thread model: `claude -p "Run the <agent> agent on ..." --model <id> --output-format stream-json --verbose --allowedTools "Agent,Read,Grep,Glob,Bash(node .claude/hooks/*),Bash(git diff *),Bash(git log *),Bash(npm run *)"`. Change one thing per arm (one frontmatter line, or one sentence), in a fresh copy of the app, at least twice per arm.
  4. Read the facts from the saved stream, not from the summary: which model ran the agent, which files it read, how many of the known defects it found, the cost and the time.
- **A workaround that guards against the platform, not the model, is not a row.** A model review cannot test it; it goes when the platform changes.

The audit for prose that code could do (the saved `harness-audit` workflow, [building.md](building.md)) is **not part of the review**. It is optional and runs only when the App-Studio Owner asks for it.

## Where the model is named

- **One table maps each role to a model:** "Models" in `plugins/studio/skills/harness-sync/harness.md`, which every app gets. The roles are **the standard thread model**, **the review model** and **the strongest model** (a third tier that runs only when the App-Studio Owner, an App Creator or a written plan asks for it; decided 2026-11-27).
- **Rules name the role, never the model:** this repo's governance pages, the app template, skills, agents and packs. `coherence-lint` rule 8 fails on a model name in those files, and on an agent that pins a model the table does not list.
- **Frontmatter pins it for helpers:** `model:` and `effort:` in `plugins/studio/agents/*.md`, `packs/*/agents/*.md` and each `SKILL.md`.
- **Read from the table by code:** the settings lines of `app-setup.mjs project-report`.
- **Named for another reason (not thread models):** `CLAUDE_CODE_SUBAGENT_MODEL` in `plugins/studio/templates/settings.json` (the fallback for an agent with no pin), the two saved workflows in `.claude/workflows/`, `scripts/routing-test/run.py`, and the `ai-web` pack (the models an app's own AI feature calls).

A model upgrade is therefore: the table, the agents' `model:` lines, and the settings fallback. It triggers this review.

## Workarounds to test (short on purpose)

| Component | Exists because the model once... | Test by |
|---|---|---|
| Agents told to read the App profile only when it is not already in their context (`coherence-lint` rule 6 forbids an unconditional read) | re-read `CLAUDE.md` in every helper agent | in a live Project thread: ask a helper agent to quote the App profile without a tool. If it can't, drop rule 6 and tell agents to read it |
| Pinned efforts of `planner` and `reviewer` (`effort: high`) | needed more effort to plan and review well | lowering one step, comparing runs on the same seeded diff and item |
| Pinned model of `reviewer-deep` and `research-skeptic` (the review model) | missed defects in risky diffs on the standard model | running the same seeded diff on the standard thread model; needs a diff hard enough that the standard reviewer misses something |
| Pinned effort of `qa` (`effort: medium`) | did shallow QA at low effort | lowering one step in a scratch app with dependencies and a browser installed |
| `effort: low` pins on mechanical skills (release, harness-sync, test-handoff, harness-idea, human-docs) | wasted effort on mechanical work | already low; one real run of each on a new model, checked against the skill's steps |
| Prose rules that repeat what a hook already enforces | skipped the rule | deleting the prose, keeping the hook, running the action the hook guards (the first list went to #365) |
| The `finish` reminder at the end of a turn in app-studio (Stop hook) | stopped before the merge | one internal PR on the standard thread model with the reminder off; needs a way to switch it off for one thread, which does not exist yet |

Not rows (platform guards, see "What"): the second delivery of a Stop-hook failure at the next tool call (the turn can end although the hook blocked it, #214).

Add a row when you add a workaround; remove it when the test shows it is no longer needed.

## Reviews done

| Date | Model | Result |
|---|---|---|
| 2026-11-27 | Tested on Sonnet 5.5 (thread on Fable 5.2), Claude Code 2.1.332, #363 | No workaround removed: one reworded so it is safe either way, the others kept; details below. Model names in prose replaced by roles and one table. |

### What the first review taught (2026-11-27)

Result per workaround, on a scratch app with 10 seeded defects:

| Workaround | What was run | Result |
|---|---|---|
| Agents told "`CLAUDE.md` is already in your context, don't read it again" (and `coherence-lint` rule 6) | 12 agent runs with and without the sentence, and probes asking a session to quote the App profile without tools | **Reworded, rule kept, premise not settled.** The scratch app never had `CLAUDE.md` in context, not even in the main session (a headless run in a cloud container does not trust the folder), so the runs could not show whether a helper agent gets it in a real thread. They did show what happens when it is missing: `reviewer` and `reviewer-deep` read the file anyway (7 of 8 runs), while `planner` and `qa` obeyed the sentence and worked without the App profile (2 of 2 runs each). The agents now say "read the App profile unless it is already in your context", which costs nothing when it is there. Checked once after the change: the reworded `planner` read it and planned to the domain rules. |
| `reviewer` at `effort: high` | the seeded diff, 4 runs at high and 2 at medium | **Kept, not settled.** Medium found 10 of 10 defects in both runs, as high did, for about a third less cost and half the time. The diff was too easy to separate them, so the pin stays until a harder diff is tried. |
| `reviewer-deep` on the review model | the same diff once on the review model, compared with the 4 standard-model runs | **Kept.** Both found 10 of 10. The review model also found a data-loss path and a two-tab overwrite that the standard runs rated lower or missed, at about three times the cost. One easy diff does not justify moving risky reviews down. |
| `planner` at `effort: high` | the item planned once at high and once at medium | **Kept, not settled.** The two plans covered the same criteria and risks; one run each proves little. |
| `qa` at `effort: medium` | once at medium, once at low | **Kept.** The seeded diff did not build, so neither run reached the browser. Medium still listed every uncovered criterion; low said it could not tell. |
| `effort: low` on mechanical skills | no run of its own; the real `harness-sync` of #359 ran on the standard model | **Kept.** `harness-sync` was followed in a real 76-release update. `release`, `test-handoff`, `harness-idea` and `human-docs` were not tested. |
| Prose that repeats a hook | not tested, by the issue's own instruction | The list of candidates went to #365. |
| The `finish` reminder (Stop hook) | not tested | It can't be switched off for one thread without changing the loader, and a fair test is a real merge on the standard model. The row now says so. |

What changed in this page because of the run:

- **The procedure said to run "the live-check scenarios that cover" a workaround. None does.** The removal test is now a scratch app, seeded defects and headless runs, written out under "What".
- **Rows were regrouped by what one test can answer:** the single row "pinned agent models and efforts" became three, because effort and model need different tests and `qa` needs an app that builds.
- **Two rows were missing:** `research-skeptic` (pinned to the review model) and `human-docs` (`effort: low`). Both are added, not tested.
- **The Stop-hook row mixed two things.** The reminder is a model workaround; the second delivery of a missed failure guards against the platform (#214) and is no longer a row.
- **"Only in frontmatter" was not true.** The section now lists every place a model is named, and a lint rule keeps prose to roles.
- **Next time, make the seeded diff harder and make it build.** Ten plain defects were found by every arm, and one of them (unused code) broke the build and stopped both `qa` runs. Seed defects that need reasoning across files, and check `npm run build` before the first run.
- **The harness's own verdict step fails in a headless run:** the agents could not pipe JSON into `verdict.mjs` under a tool allowlist. It does not affect the findings; allow `Write` to the scratch app next time.
- **A headless run in a cloud container does not load the scratch app's `CLAUDE.md`,** so any row about what is "already in context" cannot be tested this way. Test it in a live Project thread instead: ask a helper agent to quote the App profile without using a tool.
- **Check the test bed before the first arm:** ask the main session the same question. This run found the gap only after all the arms had run.
