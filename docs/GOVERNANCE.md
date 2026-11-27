# How app-studio evolves

This is the rulebook for changing app-studio itself. It is permanent: change it only through a PR, and a change to a rule needs the App-Studio Owner's OK (section 5). It is a short core that every studio thread reads. Sections 3 to 9 keep their numbers and point to **on-demand files in `docs/governance/`**: read one only when your task needs it. For the history behind these rules, see the archived [handover](archive/HANDOVER-2026-11.md).

> **Two scopes**
> - **The studio Project** (this repo) evolves and governs the harness. Its rules are this file and `docs/studio-project-instructions.md`.
> - **App Projects** build apps with the harness, pull harness updates, and send `harness-idea` issues here. Their rules are the app template: `plugins/studio/templates/project-instructions.md` and `CLAUDE.md`.
> - A change to one scope's rules does not change the other's. Changing the app template changes what apps get at their next sync.

## 1. What app-studio is, and who decides

- **app-studio is the master copy of the harness** that every app is built with: skills, agents, hooks, templates, stack packs, and the loader that brings them into Claude Code Project threads. Nothing in it is about one app.
- **App-Studio Owner (product owner of the harness)** decides what changes and when it ships to apps. The App-Studio Owner doesn't read code and judges by how the workflow behaves.
- **Claude (engineer)** proposes, builds, tests and documents every change, and asks the App-Studio Owner only product decisions, one at a time, each with a recommended answer.
- **Personal setup** (account, laptop and environment notes) is not part of the harness and is never changed from here.

## 2. Where app-studio changes

- **Only in the "app-studio" Claude Code Project** (its instructions are in [studio-project-instructions.md](studio-project-instructions.md)), or, as a fallback, a cloud session with only app-studio attached.
- **Never from an app's Project or session, with no exception:** no approval lifts it, and that includes marking a release `Live check: passed` (only the studio Project does that). Apps send ideas (section 3) and pull released changes (section 6). The harness's write, merge and git hooks refuse writes, merges, approvals and pushes to app-studio from an app (issues stay open for `harness-idea`). Claude's GitHub access is the person's own, so this is a strong guard, not a lock.
- **One exception, the live-check mailbox:** a thread may post reviews and comments on the two never-merged draft PRs of `studio-scratch`, and nothing else there ([live-checks.md](governance/live-checks.md)).
- The app-studio Project runs on its own cloud environment, **"app-studio"**, whose setup script is `scripts/env-setup.sh` (the same file as "app-studio apps"). In a checkout of app-studio itself the loader wires only the Stop hook that keeps `finish` running until DONE; it never loads the harness as if app-studio were an app. "app-studio apps" is for apps; Default stays untouched.

## 3. How ideas come in

One queue: **GitHub issues on app-studio**, labelled `harness-idea` (sent by an app, not yet triaged) or `studio-backlog` (accepted). Ideas from the App-Studio Owner in conversation become a `studio-backlog` issue first, so nothing lives only in a chat. Filing rules and the label rule: [intake.md](governance/intake.md).

## 4. Triage

The coordinator triages open `harness-idea` issues when the App-Studio Owner asks or at the start of a batch: accept (relabel `studio-backlog`), merge (comment on the other issue, close as duplicate) or decline (close with a one-line reason). Closing always leaves exactly one comment, and the trail rules are in [intake.md](governance/intake.md).

Claude recommends; the App-Studio Owner decides anything that changes how they work or what apps do. The order of work is the order the App-Studio Owner gives; without one, issues that hurt every app's daily use come first, then safety, then new capability. `node scripts/coordinator.mjs next` prints that order, dependencies, blocking PRs and likely duplicates, and `coordinator.mjs triage` prints the exact label change and trail comment ([intake.md](governance/intake.md)).

## 5. Building a change

- **One thread per issue**, on the standard thread model. The review model only for risky designs, or after a thread fails twice; the strongest model only when the App-Studio Owner or a plan asks for it. One table maps each role to a model: "Models" in [harness.md](../plugins/studio/skills/harness-sync/harness.md). Read the issue, this file and the files involved before changing anything.
- **Keep the core generic:** app facts go in an app's App profile, stack facts in a stack pack. `node scripts/core-lint.mjs` must pass.
- **When the build is done, run `node scripts/finish.mjs start`** with only the judgement inputs (summary, what changes for the App Creator, scenario ids, what wasn't verified; `node scripts/finish.mjs start --help` lists them), then `node scripts/finish.mjs next` and make exactly the calls it prints until DONE. Every post-build step is code: the change's unreleased entry, checks, PR (always opened as a draft, so CI runs once, when it is marked ready: at once for an internal change, after its live check for one apps receive), live check, merge by tier. Report status only from `finish.mjs status`. The inputs and what the code does: [building.md](governance/building.md).
- **Releases come in batches.** A PR never raises the plugin version: its change waits as one small entry in `releases/unreleased/`. A release is cut on purpose, about weekly or when the App-Studio Owner asks, with `node scripts/finish.mjs release`: one version, one changelog section and one release record for every waiting change. Apps get releases only, never what merged since the last one, and no release is cut while a change still waits for its `main` check.
- **Who merges, by tier** (CI sets the tier from the files the PR changes and prints it on the run): **the owner tier** (the loader, the setup script, CI and the tier rules, unknown files, a rule file unless only its wording changed, a lost test, a changelog **App action** or **Admin action**, more than about 400 lines) merges only after the App-Studio Owner's OK in the thread, which covers the PR's own changes and never a later change to them. Every other tier merges when `check` is green, never around a required check or approval. A thread can raise a PR's tier with the label `tier:owner`, never lower it.
- **Model review:** when a new model becomes the default, or about every 15 releases, the coordinator proposes a harness review in one line with its cost: a re-audit and a removal test of the listed workarounds ([model-review.md](governance/model-review.md)). Guidance only.
- **Also in [building.md](governance/building.md):** the checks before a PR, how skills are drafted (skill-creator), the coherence review, and how scenarios are written. Propose a coherence review in one line after a change to this file, a skill, the app template or the routing; it runs only after the App-Studio Owner says yes.

## 6. How changes reach apps

The loader reaches every app at the next thread; harness content only when an app runs `harness-sync`; pack starter files only into new apps; the setup script only after an Admin paste. Avoid changing `scripts/env-setup.sh`, and keep the loader working with every app copy from 0.6.0 on. The table, the loader rules and the rollout rules: [rollout.md](governance/rollout.md).

## 7. Verifying in a real Project

Changes that apps experience (the loader, the bootstrap, the merge flow, the app template's instructions) are verified live on the branch in the **studio-scratch** Project before they merge, and loader or setup changes again on `main`; `finish` requests and reads the checks by code. Changes to app-studio's own instructions or rules (this file, `docs/studio-project-instructions.md`) get no studio-scratch check, because it never sees them: when the change matters, check it with a fresh thread in the app-studio Project. Steps and the mailbox: [live-checks.md](governance/live-checks.md).

## 8. Ways of working (studio Project; the app template has its own copy)

- One thread per issue; never resume a thread that has been idle for over an hour. Start a new one that reads the issue and the PR.
- **A thread stays inside its issue.** When the work is done or blocked it hands back and stops; it never proposes, plans or starts the next issue or phase. Only the coordinator proposes the next issue and starts its thread.
- The coordinator picks the next issue from `node scripts/coordinator.mjs next` rather than reading every issue.
- The coordinator posts to the App-Studio Owner only when something is done, blocked, or needs a decision.
- **Point, don't repeat.** When a thread hands back something for the App-Studio Owner to act on (a test, an OK, a live-check prompt, a manual step), the coordinator sends one short line with a link to that thread and what is needed, instead of repeating the thread's report. A product decision about a thread's own work is asked and answered in that thread. The coordinator summarizes instead when several threads are in parallel and one merged action or recap is more efficient, or when the matter spans more than one thread (ordering, the next issue). The App-Studio Owner can ask the thread for a shorter recap.
- Plain English for the App-Studio Owner: lead with the outcome and its impact; no step-by-step narration; say plainly what wasn't verified.
- Before big work, a short plan and the App-Studio Owner's OK.
- **The Admin does a manual step only when Claude genuinely can't.** Anything Claude can do itself it does, without handing the Admin paste or click instructions (e.g. the coordinator applies the Project instructions itself). It can't edit the Project's "What do you want to work on?" text, repo Settings or delete branches. When a manual step is really needed, give exact, complete, copy-ready instructions.
- Never put secrets in the repo, issues or chat.

## 9. Repo settings that protect `main`

The Admin set GitHub's merge settings and the `main` ruleset once; CI's `check` decides the rest: the tier, the `owner-ok` label, the branch live-check gate, the merge queue and the off switch (`ALL_NEED_OWNER`). A PR can't change how it is judged: `ci.yml` runs only from `main`, and any change under `.github/` is the owner tier. Details and settings: [ci-and-merge.md](governance/ci-and-merge.md).
