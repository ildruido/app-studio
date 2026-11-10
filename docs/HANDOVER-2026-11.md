# Handover, November 2026: app-studio gets its own Project and governance

Written on 2026-11-10 at the end of a long session that reworked app-studio (versions 0.6.0 to 0.7.2). It carries that session's context, so the next sessions don't have to re-derive it. **Read it with [GOVERNANCE.md](GOVERNANCE.md).** When phase 2 is done, move this file to `docs/archive/`.

## 1. Why this exists

Ale wanted three things: a harness that **works in Claude Code Projects** (Ale's preferred way of working), an **automatic bootstrap** of a new app from an empty Project, and to know what the **claude-setup** repo is for. It turned out that:

- **app-studio worked only in single-repo sessions.** A Project thread starts in the folder above the repos, so none of an app's skills, agents or hooks loaded: no lint, tests, health check or merge gate. Only the `CLAUDE.md` text applied.
- **app-studio had no rules for its own evolution.** Fixes were made from inside app sessions, which let the harness drift.
- **claude-setup has a different purpose:** Ale's personal setup plan, skills and analyses. It isn't part of the harness. Its only overlap was a bootstrap snippet in the Default environment, now obsolete (#37).

The session settled on: **one Claude Code Project per app**, and **one Project for app-studio itself**, which is the only place app-studio changes. Apps send ideas as issues and pull released changes. The rules are in [GOVERNANCE.md](GOVERNANCE.md).

## 2. What changed on 2026-11-10

| Version | PR | What and why |
| --- | --- | --- |
| 0.6.0 | #23 | The **"app-studio apps"** cloud environment and its setup script load the harness into every Project thread. `new-app` was rewritten for the Project order: an empty Project, then one init prompt. Project-instructions template; `harness-idea` skill (apps send ideas as issues); cost rules (one thread per item, Sonnet threads, never revive a thread idle for over an hour). |
| 0.6.1 | #24 | The environment's setup is **cached between threads**, so copying skills at setup time froze an old harness. Now setup installs only a fixed launcher, and at every thread start and hook the launcher runs the current `scripts/studio-env.mjs`, which links skills and agents (no copies) and passes hooks to the app. |
| 0.7.0 | #25 | **PRs merge themselves:** `CI gate` job (always reports, so `main`'s ruleset can require it; a draft never passes), Harness on every PR, one-time repo settings in `new-app` (squash only, auto-merge, delete branches, a `main` ruleset requiring `CI gate` and `health`), a ~5-minute wake-up instead of waiting for notifications. Also: an empty repo gets `main` without asking Ale, a proposed "What do you want to work on?" text, a clearer start-up message, and a hook log (`/tmp/studio-hooks.log`). |
| 0.7.1 | #26 | The web pack had names left from chess-coach (`/api/coach`, `coach_usage`, …), now `ai`. `core-lint` rejects "coach". |
| 0.7.2 | #27 | The merge hook counts only each check's latest run; PRs are opened ready, not as a draft; an already-green PR is merged straight away. |

**Verified live** in the studio-scratch Project: one-prompt bootstrap of an artifact app (with Project instructions and models applied), the harness loading in threads, PRs merging by themselves with their branches deleted, `main` protected, hook runs logged, and an app sending an idea as an issue (#28).

## 3. Facts learned the hard way (don't re-derive)

- **Project threads** start in the folder above the repos (`/home/user` or `/home/claude`, it varies). Claude Code loads skills, agents and settings only from there. Every repo in Project settings is attached to every thread.
- **The coordinator** can't run commands and has no GitHub tools. It can start and message threads, change the Project instructions and default model, add a repo, and use project memory. Threads do all repo work. Whether it can set the "What do you want to work on?" box isn't known yet.
- **The environment's setup script runs once and is reused between threads.** Never do work at setup time that depends on the repos' current content. That's why there's a launcher.
- **Linked skill folders work,** and Claude Code picks up skills added mid-session.
- **GitHub notifications for finished checks are unreliable** (missed or minutes late). Always set a wake-up and read the checks.
- **Auto-merge needs a ruleset with required checks** (works on Ale's paid GitHub plan). It refuses to switch on for a PR that's already green ("clean"). A required check that doesn't run blocks a PR forever, which is why `CI gate` always runs.
- **An empty repo's first pushed branch becomes the default branch.** That happened to studio-scratch (#31).
- **Hooks are silent when they pass.** The launcher logs each run in `/tmp/studio-hooks.log`. The lint hook fires only on Claude's Edit and Write tools, not on shell edits (#28).
- **Threads on Auto mode edit files with shell commands** as often as with Edit and Write.

## 4. Set up the app-studio Project (Ale, about 10 minutes)

1. **Create a Claude Code Project** named `app-studio`.
2. **Settings → Environment:** add the repository `ildruido/app-studio` only, and select the **Default** cloud environment (not "app-studio apps").
3. **Settings → General:**
   - Coordinator model: Opus. Thread model: **Sonnet**. Thread effort: **Medium**.
   - "What do you want to work on?": *Keep app-studio a reliable, generic harness for building apps in Claude Code Projects: work through its issues one at a time, with each change tested, versioned, approved by Ale, and verified live in studio-scratch when it affects the loader, bootstrap, merge flow or app template.*
4. **Settings → Memory → Project instructions:** paste the text below the line in [studio-project-instructions.md](studio-project-instructions.md).
5. **First prompt to the coordinator:**

   > Read `app-studio/docs/GOVERNANCE.md` and `app-studio/docs/HANDOVER-2026-11.md`, then start phase 1 of the handover. One step at a time; ask me only product decisions, each with a recommendation.

Other Projects: archive **harness-test** (a one-off test). Keep **studio-scratch** as the sandbox for live verification. Leave **chess-coach** and **band-studio-os** untouched until #36.

## 5. Phase 1: governance basics (done 2026-11-10)

The goal was to prove the governance loop works before building anything bigger. All four steps are done.

1. ✅ **Repo settings for app-studio** (Ale, as clicks the thread gives; the exact settings are in GOVERNANCE section 9):
   - Settings → General → Pull Requests: squash merging only, and automatically delete head branches.
   - Settings → Rules → Rulesets: a `main` ruleset requiring the `check` status check, and blocking deletion and force pushes.
   - No auto-merge: app-studio PRs merge only with Ale's OK.
2. ✅ **First triage** (GOVERNANCE section 4): #28 is the only `harness-idea`; recommend accept or decline. Then show Ale the phase 2 order below and confirm or change it.
3. ✅ **Pilot change through the full process:** #30 (explain the two update paths, and a test that keeps the loader compatible with older app copies). It's small, needs no live Project test, and exercises triage, thread, checks, version, changelog, PR, Ale's OK and merge. Done as PR #40 (0.7.3).
4. ✅ **Close phase 1:** a short PR that ticks this section and fixes anything in GOVERNANCE.md that phase 1 showed was wrong or missing.

## 6. Phase 2: the parked work (in this order unless Ale changes it)

| # | Issue | Why at this point | Notes |
| --- | --- | --- | --- |
| 1 | #29 Backlog ownership and test-script delivery in Projects | Hurts every app's daily use | Product decisions for Ale. Verify live with one release in studio-scratch. |
| 2 | #31 `new-app` confirms `main` is the default branch | Small safety net | |
| 3 | #28 Lint also on shell edits (from an app) | Closes a gap in the guardrails | Idea: the end-of-turn hook lints files changed since the last commit. |
| 4 | #32 Genericity audit (chess-coach-shaped, AI-first assumptions) | Must come before any web-pack work | Audit only; Ale decides the direction. |
| 5 | #33 Web pack default AI models | Depends on #32 | Check current model ids and prices first. |
| 6 | #34 Bootstrap a web app in a Project, end to end | Depends on #32 and #33 | Before Ale starts a real web app. |
| 7 | #35 PR #20's remaining rule proposals | Lower urgency; partly settled | Then close PR #20. |
| 8 | #36 Migration plan for chess-coach and band-studio-os | Last: the harness should be stable first | Inventory first, one app at a time, with a way back. |
| — | #37 claude-setup cleanup | Any time; mostly Ale's clicks | Done in claude-setup, not here. |

New `harness-idea` issues from apps get triaged as they arrive (GOVERNANCE section 4) and slot into this order by the same rule: daily-use pain first, then safety, then new capability.
