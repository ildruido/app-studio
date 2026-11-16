# AI module for the web app: review checklist

For the `reviewer` agent, in addition to the web pack's checklist. Use Opus (high effort) for diffs that touch the AI endpoint, the allowance or the usage ledger.

- **Cost.** AI calls use the cheapest model tier that does the job; allowance checks stay in place and run before the upstream call.
- **Logs.** No prompt, answer or key in logs or test output.
- **Contract.** A change to `/api/ai` updates the endpoint section in `.claude/packs/ai-web/STACK.md` and the web adapter in the same PR.
- **Migrations.** `ai_*` migrations stay additive and safe on a database that already has the tables.
