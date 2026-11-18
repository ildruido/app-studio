# Phase 3 — agents, hooks, CI (read: planner/qa/reviewer, hooks/check.mjs head, cloud-setup.mjs, templates/settings.json, ci.yml)
Headline: hooks and CI are ALREADY deterministic code (commit gate, merge gate, write gate, lint, tests, tier, owner-ok fingerprint, release-check). Little left to move there. The remaining model-instruction cost is in the 3 agents, which run on every feature (planner only for >1-file items).

## Agents
- **A1 · reviewer step 2 "Process" + parts of Security** → `review-precheck` script run before the agent: Conventional Commit format, `Refs:` id present, CHANGELOG entry under Unreleased, no edits to files in `lock.json`, grep for `innerHTML`, secret-like strings, hosts not in the stack allowlist, AI code present while profile says AI off. Prints a findings list the reviewer starts from. Safe for the greps/format checks (false positives are filtered by the reviewer = needs-judgement on severity). Saving ~400-700/review (less reading of diff for mechanical issues), runs every feature; also more reliable.
- **A2 · qa steps 1+4** → `qa-run` script: build, e2e for changed area (map changed src paths to specs), build output size vs stack limits, one pass/fail table. Safe for build/size/run; mapping path→spec = needs-judgement (see INDEX 2c·B4). ~400/feature.
- **A3 · qa step 3 exploratory checks** → ship a generic Playwright "baseline" spec per pack: 375px no horizontal scroll, light/dark render, reload keeps state, keyboard focus visible, capability-missing handling. Runs in CI too. Safe for the generic checks; app-specific flows stay with the model. Saving ~1,000-2,000/feature (browser exploration is the costliest part) and catches regressions in CI for free.
- **A4 · qa step 2 criteria→test coverage** → require tests to name the criterion id (`// AC1`); script lists criteria without a test. Safe once the convention exists; convention change = needs-judgement (template + planner wording). ~300/feature.
- **A5 · all three agents "read CLAUDE.md first"** → if subagents already receive CLAUDE.md automatically the read is a duplicate; if not, a `profile show` command printing only App profile + stack notes (~2K of a 23.7K file). Needs-judgement: first verify live whether subagents auto-load CLAUDE.md. Potential ~2-6K per agent spawn (3 spawns/feature) — the largest single item in this phase. NOT verified here.
- **A6 · planner/qa/reviewer reply formats** (section order, <400 words, `QA: pass`, `Verdict:` line) → `agent-reply-lint` on the returned text; build-feature retries only on failure. Safe; low value (~100-200), skip unless A1-A5 land.
- Planner itself: no deterministic part worth moving (design judgement); only "new capabilities/permissions" risk line = existing 2c·B3 capabilities-diff.

## Hooks
- **H1 · check.mjs lint/test/commit/merge/write** — already code; nothing to move.
- **H2 · hook failure output** is capped at the last 4,000 chars (check.mjs:196,213) — ~1K tokens each time a gate fails. Safe to cut to the first failing test/rule + count (summary mode, full log in a file). Saving ~500-800 per failing run; failures are common. Safe.
- **H3 · SessionStart `studio-sync check --warn`** prints only "is off" notes already (studio-sync.mjs:1539); `cloud-setup.mjs` prints one line. Both near-silent: nothing to save.
- **H4 · `pre-commit`** is a 1-line wrapper; nothing to save.

## CI (ci.yml)
- **C1 · ci.yml jobs tier/tests/check** — fully scripted; the model only reads the `check` result. Candidate: a `studio-sync pr-status <n>` command that summarises tier + check + auto-merge state in one line (overlaps 2c·R1/B5, needs GitHub API) — needs-judgement, ~200-300 per PR.
- **C2 · failing-CI log reading**: threads read job logs by hand (`get_job_logs`, often 5-20K tokens). A CI step that writes a ≤30-line failure summary to the job summary/PR comment (first failing test, file:line) is safe and the biggest CI saving: ~3-10K per CI failure. Needs-judgement only for what to include.
- **C3 · packs smoke list** (8 `packs-smoke.mjs` invocations hard-coded in ci.yml) → derive from packs metadata. Safe, no token saving, reliability only.

## Totals
Per feature: ~2-4K tokens if A1-A4 land (A3 largest), up to 8-14K more if A5 proves out; plus ~3-10K per CI failure (C2). All high frequency.
