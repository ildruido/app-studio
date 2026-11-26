# Model review: keep the harness as small as the model allows

Guidance only. No CI check and no warning enforces it (App-Studio Owner, 2026-11-25). Every part of the harness encodes an assumption about what the model can't do alone; a better model makes some of those assumptions false.

## When

- A new Claude model becomes the default for app threads, **or**
- about 15 releases have passed since the last review (the last one is named in the table at the end).

The coordinator proposes the review in **one line with its rough cost**, and it runs only after the App-Studio Owner says yes (section 4: Claude recommends, the Owner decides).

## What (two parts)

1. **Re-run the audit** for prose that code could now do: the saved `harness-audit` workflow ([building.md](building.md)), or by hand. Output: issues, one per finding.
2. **Removal test**, only for the workaround list below. Per entry: turn it off on a branch, run the live-check scenarios that cover it, and keep the removal only if they still pass. Test only what the new model plausibly fixes; each test costs runner time.

## Where the model is named

Only in frontmatter: `model:` and `effort:` in `plugins/studio/agents/*.md` and `plugins/studio/skills/*/SKILL.md`. A model upgrade is therefore one deliberate harness change, and it triggers this review.

## Workarounds to test (short on purpose)

| Component | Exists because the model once... | Test by |
|---|---|---|
| Agents told not to re-read CLAUDE.md (`coherence-lint` rule 6) | re-read it in every sub-agent | dropping the rule, checking a build thread's token use |
| Stop-hook note re-delivered until `finish` is DONE | stopped before the merge | dropping the repeat, running a full `finish` |
| Prose rules that repeat what a hook already enforces | skipped the rule | deleting the prose, keeping the hook |
| Pinned agent models and efforts (`planner`, `reviewer`, `qa`, `reviewer-deep`) | needed a stronger model or more effort for review | lowering one step, comparing reviews of the same diff |
| `effort: low` pins on mechanical skills (release, harness-sync, test-handoff, harness-idea) | wasted effort on mechanical work | already low; only check a new model still follows them |

Add a row when you add a workaround; remove it when the test shows it is no longer needed.

## Reviews done

| Date | Model | Result |
|---|---|---|
| none yet | | First review is due at the next default-model change. |
