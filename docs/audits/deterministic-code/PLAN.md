# Plan that originated this audit pack

Requested by the App-Studio Owner, 2026-11-18. Verbatim.

## Original request

> Plan an incremental and phased analysis with the objective stated below.
> Important rule for this task: we are running out of usage, so it's important that each step stays smalls, and is able to  deliver incremental "done" results persisted in an outcome artefact, which the next step can continue with minimal context handover and without having to read the entire artefact which will inevitably incrementally grow in size.
>
> The objective of the analysis is to check app-studio harness in its entirety for any part that could be safely moved to deterministic code, instead of human language that consumes token at each run.

## Approved plan

> Here's the plan. Each step is one small, fresh thread that reads only a short index plus its own slice of the harness, then stops.
>
> **Outcome artefact** (`audits/deterministic-code/`):
> - `INDEX.md` is capped at about 40 lines. It holds a status table, one line per finding, and "next step reads X". It's the only file every step opens.
> - Each phase writes its own detail file. Later steps never read old detail files.
>
> **Phases**
> 1. **Inventory.** List every harness file with its size and when it gets loaded or run, and by whom. This writes `INDEX.md` and splits the work into slices. No judging yet.
> 2. **Skills,** one slice per step (about 3 to 5 skills each). Find steps that follow fixed rules, like counting, parsing, copying, checking or formatting, as opposed to steps that need judgement.
> 3. **Agents, hooks and CI checks.**
> 4. **Templates:** app `CLAUDE.md`, project instructions and new-app setup.
> 5. **GOVERNANCE** and the release flow.
> 6. **Synthesis.** Rank the candidates by tokens saved and risk, from `INDEX.md` only, and propose issues for you to accept.
>
> **Rules:** read-only, no PRs, no wiki. It skips what #171 to #173 already scripted. Each finding is marked "safe" or "needs judgement" with a rough saving.
