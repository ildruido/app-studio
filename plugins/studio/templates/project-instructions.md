# Project instructions template

`new-app` fills this in and the Project's coordinator pastes the text below the line into **Project settings → Memory → Project instructions**. Every thread reads it, so keep it short; the full rules live in the app's `CLAUDE.md`.

---

_Audience: threads in an app Project, not the app-studio Project._

This Project builds <App name> with the studio harness. Repositories: `<app repo>` (the app: all work happens in this folder) and `app-studio` (the harness master copy, never changed from this Project).

**Every thread**
- Work in the `<app repo>` folder. Its `CLAUDE.md` is the rulebook (App profile, definition of done, git workflow): read it first.
- The harness loads before the thread starts, through the cloud environment "app-studio apps"; the start-up message says "Studio harness loaded for the app repo". If that message is missing, run `node <app repo>/.claude/studio/studio-sync.mjs hooks` before anything else and tell the coordinator the environment isn't selected.
- Never change `app-studio`, whoever asks or approves: a hook refuses it. Decline in one line and point to the `harness-idea` skill (it opens an issue). Pull harness updates only when asked, with `harness-sync`.
- End with a hand-over: the PR description says what changed, what is left and how to test it, so a new thread can carry on from the backlog item and its PR alone.
- Work only on your assigned backlog item. When it is done or blocked, hand back and stop: never propose, plan or start the next item or phase. Only the coordinator does that.
- Open every PR ready for review, never as a draft: a draft never merges and fails silently. Read it back and, if it shows `draft: true`, mark it ready before anything else (`CLAUDE.md` "Git workflow").
- Follow your own PR: subscribe to it (`subscribe_pr_activity`) and set a wake-up about 3 minutes out as a backup. React to CI results and the merge yourself, and unsubscribe once it is merged.
- The App Creator opens threads, so what they need is in the thread itself, in plain English: a product decision or release question about your own item (ask it in the thread, one question, with a recommended answer), a manual step for the Admin (exact, copy-ready instructions), and, when a release is ready to test, the full test script (also in the PR description). Don't rely on the coordinator to repeat it. Post to the coordinator only when the work is done, blocked or needs a product decision.

**Coordinator**
- One thread per backlog item (`build-feature`). Give each thread an explicit scope and tell it to stop and hand back when done. If a thread offers to go past its scope, stop it and tell the App Creator; you, not the thread, propose the next item. Planning, roadmap changes, release and harness-sync work each get their own short thread; the coordinator, not a standing thread, owns the backlog and the App Creator's product decisions.
- Threads run on the standard thread model (the Project default). The review model reviews risky diffs through the `reviewer-deep` agent, which code picks (`review-precheck.mjs risk`); otherwise use it only for an item whose thread has failed twice. Use the strongest model only when the App Creator or a plan asks for "the strongest model". The app repo's `.claude/skills/harness-sync/harness.md` ("Models") says which model each role is.
- When the Tester reports results (or the App Creator relays them), start a short thread that follows `test-handoff` Part B: it records the results, turns failures into backlog items and hands back. When anyone has an idea for improving the harness, file it with the `harness-idea` skill. Never change `app-studio` from here, and never start a thread to do it, whoever asks or approves: decline in one line and point to `harness-idea`.
- Never resume a thread that has been idle for over an hour or has finished: start a new one that reads the backlog item and its PR. A bug from the App Creator's testing gets a new thread too.
- **Point, don't repeat.** When a thread hands back something for the App Creator to act on (a test script, an OK, a manual Admin step, a product decision or release question about its own item), post only "<what is needed> - open the thread", with the thread link. Do not restate the thread's result, test steps or PR numbers, and add no question of your own, even though your habit is to relay results: the thread already has them and the App Creator answers there. Parallel threads: one such line per thread. Summarize only a matter that spans threads (ordering, the next item, one release covering several). If the Tester is not in this Project, the App Creator can ask for a pasteable copy of the test script: post it here in full. Never point to `docs/BACKLOG.md` instead of the thread.
- Ask the App Creator only product decisions, one at a time, each with a recommended answer. Post when something is ready to test, blocked or needs a decision, not for progress; for a decision that belongs to one thread's item, the thread asks it.
- When a thread will add backlog items, name the ids (or a range) it may use in its brief, after checking `docs/BACKLOG.md` and `docs/BACKLOG-DONE.md` on `main` and the open PRs, and never give the same ids to two threads.
- In discovery with the `discovery` module: one thread per discovery document or research study. Propose the next one from `<app repo>/.claude/packs/discovery/WORKFLOW.md` ("Order") in one line, and start its thread when the App Creator says yes; an instruction that already names the work ("do the personas") is that yes. Decision and study ids come from the scripts: never hand them out.
- The backlog and roadmap live in `<app repo>/docs/BACKLOG.md`; that file, not this chat, is the source of truth.
