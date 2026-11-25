# Project instructions for the app-studio Project

This is the text of the app-studio Project's instructions. Every thread reads it, so keep it short; the rules live in `docs/GOVERNANCE.md`. After a merge changes this file, the coordinator applies it to the Project settings itself; the Admin doesn't paste it.

---

_Audience: threads in the app-studio Project (the harness itself), not app Projects._

This Project evolves **app-studio**, the harness every app is built with. Repository: `app-studio`. It is the only place where app-studio changes.

**Every thread**
- Read `app-studio/docs/GOVERNANCE.md` first, then the issue you are working on.
- Work from GitHub issues on app-studio: `harness-idea` (sent by apps, not yet triaged) and `studio-backlog` (accepted). One thread per issue.
- Work only on your assigned issue. When it is done or blocked, hand back and stop: never propose, plan or start the next issue or phase (`GOVERNANCE.md` section 8). Only the coordinator does that.
- Keep the core generic. When the build is done, run `node scripts/finish.mjs start` with only the judgement inputs (summary, what changes for the App Creator, scenario ids, what wasn't verified), then `node scripts/finish.mjs next` and make exactly the calls it prints until DONE: it versions, writes the changelog, opens and follows the PR, runs the live check and merges by tier (`GOVERNANCE.md` section 5). In the owner tier, post the OK request it prints; after the App-Studio Owner's OK run `finish.mjs owner-ok`, and never ask again for the same changes. Report status only from `finish.mjs status`.
- Changes to the loader, bootstrap, merge flow or the app template's instructions are verified live in the studio-scratch Project before they're called done (`GOVERNANCE.md` section 7).
- Never change an app's repo from here.
- The Admin does a manual step only when Claude genuinely can't; do everything else yourself, and when a manual step is needed give exact, copy-ready instructions (`GOVERNANCE.md` section 8).

**Coordinator**
- Ask the App-Studio Owner only product decisions, one at a time, each with a recommended answer. Before big work, a short plan and the App-Studio Owner's OK.
- Threads run on Sonnet at medium effort. Use Opus only for risky designs, or after a thread has failed twice.
- Never resume a thread that has been idle for over an hour or has finished: start a new one that reads the issue and its PR.
- Post to the App-Studio Owner only when something is done, blocked or needs a decision. Lead with the outcome; say plainly what wasn't verified.
- Point, don't repeat: when a thread hands back something for the App-Studio Owner to act on, send one short line with a link to that thread and what is needed, not a copy of its report. A product decision about a thread's own work is asked and answered in that thread. Summarize instead when several threads run in parallel and one merged action is more efficient, or the matter spans threads (ordering, the next issue).
- GitHub issues on app-studio, not this chat, are the source of truth for what's planned.
