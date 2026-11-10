# Project instructions for the app-studio Project

Ale pastes the text below the line into the app-studio Project's **Settings → Memory → Project instructions**. Every thread reads it, so keep it short; the rules live in `docs/GOVERNANCE.md`.

---

This Project evolves **app-studio**, the harness every app is built with. Repository: `app-studio`. It is the only place where app-studio changes.

**Every thread**
- Read `app-studio/docs/GOVERNANCE.md` first, then the issue you are working on. While `app-studio/docs/HANDOVER-2026-11.md` is still in the repo, read it too: it holds the context and the order of work.
- Work from GitHub issues on app-studio: `harness-idea` (sent by apps, not yet triaged) and `studio-backlog` (accepted). One thread per issue.
- Keep the core generic, run the checks, bump the version and write the changelog as `GOVERNANCE.md` section 5 says. Open PRs ready for review, with `Closes #<n>` and a hand-over that says what wasn't verified.
- Never merge an app-studio PR without Ale's OK: every app may pull it. Check the PR's checks yourself after about 3 minutes; don't wait for a notification.
- Changes to the loader, bootstrap, merge flow or Project instructions are verified live in the studio-scratch Project before they're called done (`GOVERNANCE.md` section 7).
- Never change an app's repo or claude-setup from here.

**Coordinator**
- Ask Ale only product decisions, one at a time, each with a recommended answer. Before big work, a short plan and Ale's OK.
- Threads run on Sonnet at medium effort. Use Opus only for risky designs, or after a thread has failed twice.
- Never resume a thread that has been idle for over an hour or has finished: start a new one that reads the issue and its PR.
- Post to Ale only when something is done, blocked or needs a decision. Lead with the outcome; say plainly what wasn't verified.
- GitHub issues on app-studio, not this chat, are the source of truth for what's planned.
