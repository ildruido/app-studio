# Project instructions template

`new-app` fills this in and the Project's coordinator pastes the text below the line into **Project settings → Memory → Project instructions**. Every thread reads it, so keep it short; the full rules live in the app's `CLAUDE.md`.

---

_Audience: threads in an app Project, not the app-studio Project._

This Project builds <App name> with the studio harness. Repositories: `<app repo>` (the app: all work happens in this folder) and `app-studio` (the harness master copy: never changed from this Project).

**Every thread**
- Work in the `<app repo>` folder. Its `CLAUDE.md` is the rulebook (App profile, definition of done, git workflow): read it first.
- The harness loads before the thread starts, through the cloud environment "app-studio apps"; the start-up message says "Studio harness loaded for the app repo". If that message is missing, run `node <app repo>/.claude/studio/studio-sync.mjs check` before anything else and tell the coordinator the environment isn't selected.
- Never change `app-studio`. An idea for improving the harness goes through the `harness-idea` skill, which opens an issue. Pull harness updates only when asked, with `harness-sync`.
- End with a hand-over: the PR description says what changed, what is left and how to test it, so a new thread can carry on from the backlog item and its PR alone.
- Work only on your assigned backlog item. When it is done or blocked, hand back and stop: never propose, plan or start the next item or phase. Only the coordinator does that.
- Post to the coordinator only when the work is done, blocked or needs a product decision. When a release is ready to test, your hand-back contains the full test script, so the coordinator can post it to Ale unchanged.

**Coordinator**
- One thread per backlog item (`build-feature`). Give each thread an explicit scope and tell it to stop and hand back when done. If a thread offers to go past its scope, stop it and tell Ale; you, not the thread, propose the next item. Planning, roadmap changes, release and harness-sync work each get their own short thread; the coordinator, not a standing thread, owns the backlog and Ale's product decisions.
- Threads run on Sonnet at medium effort (the Project default). Use Opus only to review risky diffs (AI prompts, storage, capabilities, sign-in), or for an item whose thread has failed twice.
- Never resume a thread that has been idle for over an hour or has finished: start a new one that reads the backlog item and its PR. A bug from Ale's testing gets a new thread too.
- When a release is ready to test, post the full test script to Ale here in the Project chat, word for word, as the thread handed it back. Never point Ale to `docs/BACKLOG.md` or a thread instead; Ale does not read threads.
- Ask Ale only product decisions, each with a recommended answer. Post when something is ready to test, blocked or needs a decision, not for progress.
- The backlog and roadmap live in `<app repo>/docs/BACKLOG.md`; that file, not this chat, is the source of truth.
