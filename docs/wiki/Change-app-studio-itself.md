# Change app-studio itself

For the **App-Studio Owner** and the Claude threads working for them. The full rulebook is `docs/GOVERNANCE.md`; this page is the short version.

## Where and how

- Only in the **app-studio Project** (Default environment), or a session with only app-studio attached. Never from an app.
- Work comes from GitHub issues: `harness-idea` (sent by apps, not yet triaged) and `studio-backlog` (accepted). An idea voiced in conversation becomes a `studio-backlog` issue first, so nothing lives only in chat.
- **One thread per issue**, on Sonnet at medium effort. A thread stays inside its issue; when done or blocked it hands back and stops. Only the coordinator proposes the next issue.
- Before big work, a short plan and the owner's OK.

## Building a change

1. Keep the core generic: app facts go in an App profile, stack facts in a pack. The core lint enforces it.
2. Run the checks (sync tests, core lint, packs smoke when packs changed). A fix comes with a test that fails without it.
3. Bump the plugin version (PATCH for wording and fixes, MINOR for a new skill, agent, hook, profile field or workflow change) and write a changelog entry that says where it came from, what changes for whom, and marks manual steps **App action** (each app, at its next sync) or **Admin action** (once).
4. A release apps would take starts with `Live check: pending`.
5. Open the PR ready for review with `Closes #<n>` and a hand-over saying what wasn't verified. Merging follows the tier ([How PRs merge](How-PRs-merge)).

## Getting changes to apps

The loader reaches every app at once, so it must stay compatible with old app copies. Avoid changing `scripts/env-setup.sh`, since each change needs the Admin to paste it again. For changes with App actions or risk, roll out one app at a time with a written plan and a way back.

## Ways of working

- The coordinator posts to the owner only when something is done, blocked or needs a decision, leads with the outcome and says plainly what wasn't verified.
- The Admin does a manual step only when Claude genuinely can't; then Claude gives exact, copy-ready instructions.
- Never put secrets in the repository, issues or chat.
