# Project instructions for the app-studio Project

This is the text of the app-studio Project's instructions. Every thread reads it, so keep it short; the rules live in `docs/GOVERNANCE.md`. After a merge changes this file, the coordinator applies it to the Project settings itself; the Admin doesn't paste it.

---

_Audience: threads in the app-studio Project (the harness itself), not app Projects._

This Project evolves **app-studio**, the harness every app is built with. Repository: `app-studio`. It is the only place where app-studio changes.

**Every thread**
- Read `app-studio/docs/GOVERNANCE.md` first, then the issue you are working on. While `app-studio/docs/HANDOVER-2026-11.md` is still in the repo, read it too: it holds the context and the order of work.
- Work from GitHub issues on app-studio: `harness-idea` (sent by apps, not yet triaged) and `studio-backlog` (accepted). One thread per issue.
- Work only on your assigned issue. When it is done or blocked, hand back and stop: never propose, plan or start the next issue or phase (`GOVERNANCE.md` section 8). Only the coordinator does that.
- Keep the core generic, run the checks, bump the version and write the changelog as `GOVERNANCE.md` section 5 says. Open PRs ready for review, with `Closes #<n>` and a hand-over that says what wasn't verified.
- Merge by the PR's tier (`GOVERNANCE.md` sections 5 and 9): in the owner tier only after the App-Studio Owner's OK in the thread, then add the label `owner-ok`; in every other tier read the PR first: if its checks are already green and it is mergeable, squash-merge it now, otherwise switch on auto-merge (never bypass a required check or approval). Right after opening a PR, subscribe to it (`subscribe_pr_activity`) and schedule a check-in about 3 minutes out (`send_later`) as a backup; react to CI results and merges yourself without waiting to be told, unsubscribe once it is merged, and confirm the PR is merged before you hand back.
- Changes to the loader, bootstrap, merge flow or the app template's instructions are verified live in the studio-scratch Project before they're called done (`GOVERNANCE.md` section 7).
- Never change an app's repo or claude-setup from here.
- The Admin does a manual step only when Claude genuinely can't; do everything else yourself, and when a manual step is needed give exact, copy-ready instructions (`GOVERNANCE.md` section 8).

**Coordinator**
- Ask the App-Studio Owner only product decisions, one at a time, each with a recommended answer. Before big work, a short plan and the App-Studio Owner's OK.
- Threads run on Sonnet at medium effort. Use Opus only for risky designs, or after a thread has failed twice.
- Never resume a thread that has been idle for over an hour or has finished: start a new one that reads the issue and its PR.
- Post to the App-Studio Owner only when something is done, blocked or needs a decision. Lead with the outcome; say plainly what wasn't verified.
- GitHub issues on app-studio, not this chat, are the source of truth for what's planned.
