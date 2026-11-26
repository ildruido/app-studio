# Discovery workflow

How the App Creator and Claude run the stage before building: from a starting idea to a reviewed handoff. `<docs>` is the Discovery profile's Docs folder (`docs/discovery/` by default). Product facts come from the **Discovery profile** in `CLAUDE.md` and the documents below; nothing here knows the product.

## Roles

- **The App Creator** owns the vision, answers product questions, approves documents (see Sign-off) and ends discovery by saying "start building".
- **Claude** interviews, researches, drafts, prototypes, records decisions and scores the exit gate.

## Documents

| # | Document | File | Made with | Exit criterion |
| --- | --- | --- | --- | --- |
| 1 | Product foundation, refined from the starting idea | `<docs>/product-foundation.md` | `discovery-interview` (foundation) | 1 |
| 2a | User reality check (a research study) | `docs/research/R-NNN-…/` | `research` (user reality check) | 2 |
| 2 | Target users and personas | `<docs>/personas.md` | `discovery-interview` (personas) | 2 |
| 3 | Riskiest hypotheses, on market and competitor studies | `<docs>/hypotheses.md` | `riskiest-hypotheses` (studies with `research`) | 3 |
| 4 | Success metrics | `<docs>/success-metrics.md` | `discovery-interview` (success metrics) | 4 |
| 5 | Constraints and non-goals | `<docs>/constraints.md` | `discovery-interview` (constraints) | 5 |
| 6 | MVP definition, then the roadmap derived from it | `<docs>/mvp.md`, `<docs>/roadmap.md` | `discovery-interview` (MVP and roadmap) | 6 |
| 7 | Prototypes (index of throwaway mock-ups) | `<docs>/prototypes.md` | `prototype` | 7 |
| 8 | Architecture handoff, independently reviewed | `<docs>/architecture-handoff.md` | `architecture-handoff` | 8 |
| 9 | Exit gate report | `<docs>/exit-gate.md` | `exit-gate` | all |
| | Decision log (kept current at every step) | the App profile's Decision log row | `node .claude/hooks/decisions.mjs` | 9 |
| | Status tracker | `<docs>/status.md` | every skill, in the same PR as its document | |

## Order

1. **Foundation:** refine the starting idea into document 1.
2. **People and market:** the user reality check (2a), then personas grounded in it (2), then the riskiest hypotheses (3). A reality check verdict of Reshape or Stop goes to the App Creator before personas start.
3. **Shape:** success metrics (4), constraints and non-goals (5), then the MVP and the roadmap (6).
4. **Show:** prototypes (7) for the flows behind the riskiest hypotheses.
5. **Hand over:** the architecture handoff (8), then the exit gate (9).

When asked what comes next, propose the first document in this order that `status.md` does not show as `done`.

## Loops

The order is the default, not a rule. Work goes back when evidence says so:

- A study or a prototype that contradicts a document reopens that document: update it in a new PR and set its row in `status.md` back to `in progress`.
- A rejected prototype goes to design alternatives (`prototype` skill) before another version is built.
- A triggered kill criterion (research module) forces Reshape or Stop on what it touches; only the App Creator can overrule it, in a recorded decision.

## Sign-off (Discovery profile, Sign-off mode)

- **`per artifact`** (default): open the document's PR, send the App Creator the link with what is still open, and merge only after their approval in the thread. So a document on `main` is an approved document; no other record of approval is kept.
- **`autonomous with record`:** merge when the checks are green, add a line to the "Steps taken without sign-off" table in `status.md`, and give a recap whenever the App Creator asks. Product questions are still asked, one at a time; only the per-document approval is skipped.

## Ways of working

- One thread per document or study. One PR per document, through the app's normal git rules: never a commit straight to `main`. Branch `docs/<slug>`, title `docs(discovery): <document>`. A discovery document has no backlog id, so the commit has no `Refs:` line.
- Ask the App Creator only product questions, one at a time, each with a recommended answer and one line on why. Decide method and technical details yourself.
- Every answer that settles a product question is recorded in the same turn with `node .claude/hooks/decisions.mjs add "<title>" --decision ".." --why ".." --by ".." --fetch`. `--by` names who decided: the App Creator, or "Claude (assumption)" for a default you chose for them. Never type an entry or pick an id by hand; study ids come from the research module's script the same way.
- Every document is short, leads with its conclusions, and keeps **Assumptions** and **Open questions** in their own sections. A claim about users or the market carries its evidence id or the word `(Assumption)`.
- Update the document's row in `status.md` in the same PR, to the status it will have once the PR is merged: `done` when the document meets its exit criterion, `in progress` when it says more work is needed. Change only your own row.
- No production code until the app is building. Prototypes are throwaway.
- Say plainly what was not checked (for example "not tried on a real phone", "no target user has seen it").

## After discovery

The exit gate reports readiness; it changes nothing. When the App Creator says "start building", the `new-app` skill asks the stack question (the handoff's recommendation is the recommended answer), `prd-intake` turns `mvp.md`, `roadmap.md` and the decision log into the PRD and the backlog, and this module is removed. The documents stay as history; from then on the backlog is the only plan.
