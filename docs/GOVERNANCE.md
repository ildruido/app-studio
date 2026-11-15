# How app-studio evolves

This is the rulebook for changing app-studio itself. It is permanent: change it only through a PR, and a change to a rule needs Ale's OK (section 5). For the history behind these rules, see [HANDOVER-2026-11.md](HANDOVER-2026-11.md).

> **Two scopes**
> - **The studio Project** (this repo) evolves and governs the harness. Its rules are this file and `docs/studio-project-instructions.md`.
> - **App Projects** build apps with the harness, pull harness updates, and send `harness-idea` issues here. Their rules are the app template: `plugins/studio/templates/project-instructions.md` and `CLAUDE.md`.
> - A change to one scope's rules does not change the other's. Changing the app template changes what apps get at their next sync.

## 1. What app-studio is, and who decides

- **app-studio is the master copy of the harness** that every app is built with: skills, agents, hooks, templates, stack packs, and the loader that brings them into Claude Code Project threads. Nothing in it is about one app.
- **Ale (product owner of the harness)** decides what changes and when it ships to apps. Ale doesn't read code; Ale judges by how the workflow behaves.
- **Claude (engineer)** proposes, builds, tests and documents every change, and asks Ale only product decisions, one at a time, each with a recommended answer.
- **claude-setup** (a separate repo) is Ale's personal setup: account, laptop and environment notes. It is not part of the harness and is never changed from here.

## 2. Where app-studio changes

- **Only in the "app-studio" Claude Code Project** (set up as in [HANDOVER-2026-11.md](HANDOVER-2026-11.md), "Set up the app-studio Project"), or, as a fallback, a cloud session with only app-studio attached.
- **Never from an app's Project or session.** Apps send ideas (section 3) and pull released changes (section 6).
- The app-studio Project runs on the **Default** cloud environment, not "app-studio apps": the latter is for apps, and would load the harness as if app-studio were an app.

## 3. How ideas come in

There is one queue: **GitHub issues on app-studio**.

| Label | Meaning |
| --- | --- |
| `harness-idea` | An idea sent from an app's Project with the `harness-idea` skill: what happened, which harness file, a suggested change. Not yet triaged. |
| `studio-backlog` | Accepted work for app-studio, from triage or created directly in the app-studio Project. |

Ideas from Ale in conversation become an issue first (a `studio-backlog` issue, written by Claude), so nothing lives only in a chat.

## 4. Triage

When Ale asks, or at the start of a batch of work, the coordinator goes through every open `harness-idea` issue:

- **Accept:** relabel it `studio-backlog`, and add a line on why and on what it depends.
- **Merge:** if another issue covers it, comment there with the new evidence and close this one as a duplicate.
- **Decline:** close it with a one-line reason the reporting app can understand.

Claude recommends; Ale decides anything that changes how Ale works or what apps do. The order of work is the order Ale gives; without one, issues that hurt every app's daily use come first, then safety, then new capability.

## 5. Building a change

- **One thread per issue** (or per small group of related issues), on Sonnet at medium effort. Opus only for risky designs, or after a thread fails twice.
- Read the issue, this file, the README and the files involved before changing anything. Don't re-derive what an issue or the handover already settled.
- **Keep the core generic:** app facts go in an app's App profile, stack facts in a stack pack. `node scripts/core-lint.mjs` must pass.
- **Checks before a PR:** `node --test scripts/studio-sync.test.mjs`, `node scripts/core-lint.mjs`, and `node scripts/packs-smoke.mjs web artifact` when a pack changed. The required `check` runs all of these on every ready PR, plus `node scripts/release-check.mjs --base origin/main`, which fails when harness files changed without a raised plugin version and changelog entry, or a pack changed without its own version bump. A fix comes with a test that fails without it.
- **Version and changelog** (`plugins/studio/.claude-plugin/plugin.json`, `CHANGELOG.md`): PATCH for wording and fixes, MINOR for a new skill, agent, hook, profile field or workflow change. A release that changes what apps get (skills, agents, hooks, templates, packs, the sync tool) starts its entry with the line `Live check: pending`: `install`, `pull` and `pack add` refuse it, so no app takes it. After the studio-scratch check (section 7), a small PR changes the line to `Live check: passed <date>`. Every entry says where it came from (the issue, or what happened), what changed for Ale, and marks manual steps as **App action** (each app does it at its next sync) or **Ale action** (Ale does it once, e.g. pasting the environment's setup script again). A pack change also bumps that pack's `version` in `pack.json`.
- **PR:** opened ready for review (not a draft), titled with a Conventional Commit, `Closes #<n>` for the issues it settles, and a hand-over in the description: what changed, what's left, how to test, **what wasn't verified**.
- **Merging follows the PR's tier** (section 9; CI sets it from the files the PR changes and prints it on the run):
  - **Ale's tier** (the loader, the setup script, CI and the tier rules, unknown files, a rule file unless only its wording changed, a lost test, a changelog **App action** or **Ale action**, more than about 400 lines): merged only after Ale's OK in the thread. The thread then adds the label `ale-ok` and merges. A new push removes the label, so the OK has to be given again.
  - **Every other tier** (what apps get, other docs, added tests, the changelog): the thread that opened the PR switches on auto-merge (squash) and GitHub merges when `check` is green. If the PR is already green, or auto-merge is off in the repo, the thread merges it straight away. A PR that apps get carries `Live check: pending`, so apps can't pull it before the studio-scratch check (section 7).
  - A thread can raise a PR's tier with the label `tier:ale`, never lower it.
  - **Follow your own PR.** Right after opening it the thread subscribes to its activity (`subscribe_pr_activity`) and also schedules a check-in about 3 minutes out (`send_later`), because an event can be missed. On a wake-up or event it reads the PR itself: a red check is fixed and pushed, a merge ends the follow-up. It never waits for Ale to say what happened. It confirms the PR is actually merged before it hands back (if not, it says why), unsubscribes (`unsubscribe_pr_activity`) once the PR is merged or closed, and reports green or red either way.

## 6. How changes reach apps: two paths

| What | Where apps get it | When |
| --- | --- | --- |
| **The loader**: `scripts/studio-env.mjs`, run by the "app-studio apps" environment's launcher at every thread start and hook | app-studio's `main`, directly | the next thread in any app's Project |
| **The harness content**: skills, agents, hook scripts, templates, stack pack docs | the app's own pinned copy (`.claude/studio/lock.json`) | only when that app runs `harness-sync` |
| **Pack starter files**: CI workflows, configs, server code | copied once into a new app; the app owns them | new apps; existing apps only by an **App action** |
| **The environment's setup script**: `scripts/env-setup.sh` | pasted into the "app-studio apps" environment by Ale | only after an **Ale action** |

Rules that follow from this:

- **The loader must keep working with every app copy from 0.6.0 on.** It reaches all apps at once, with no sync step to stop it. A test in `scripts/studio-sync.test.mjs` ("the current loader works with an app copy as old as 0.6.0") guards this; when the loader starts to need something an old copy lacks, the change must handle the missing piece, not drop the old copy.
- **Avoid changing `scripts/env-setup.sh`**: each change needs Ale to paste it again. Put logic in `scripts/studio-env.mjs` instead.
- **Rolling out to apps:** an app pulls a release with `harness-sync` part A, in a thread of its own Project, when Ale asks. Give Ale one line per app to paste into that app's coordinator. For changes with App actions or risk, migrate **one app at a time**, with a written plan and a way back, and verify with one small PR that merges by itself before moving to the next.

## 7. Verifying in a real Project

Unit tests can't show how Claude Code behaves in a Project thread: what loads at start-up, what a thread can see, how notifications behave. There are two cases:

**(a) Changes that apps experience** (the loader, the bootstrap, the merge flow, the app template's instructions) are verified **live** in the **studio-scratch** Project (a disposable artifact app, repo `ildruido/studio-scratch`, an app Project) before they are called done:

1. Merge the change (as section 5 says); its changelog entry says `Live check: pending`, so apps can't pull it yet.
2. In the studio-scratch Project, run the one prompt that exercises it (a new feature thread, a harness sync, a fresh `new-app` on an emptied repo); the sync or install commands there take `--live-check`, which only this check uses.
3. Read the result on GitHub yourself (PR state, checks, branches) instead of trusting the thread's summary, and report what passed and what wasn't checked.
4. When it passed, open a small PR changing `Live check: pending` to `Live check: passed <date>` in that entry; from then on apps can pull the release.

**(b) Changes to app-studio's own instructions or rules** (this file, `docs/studio-project-instructions.md`) get **no studio-scratch check**: it is an app Project and never sees them. When the change matters, check it with a fresh thread in the app-studio Project.

## 8. Ways of working (studio Project; the app template has its own copy)

- One thread per issue; never resume a thread that has been idle for over an hour. Start a new one that reads the issue and the PR.
- **A thread stays inside its issue.** When the work is done or blocked it hands back and stops; it never proposes, plans or starts the next issue or phase. Only the coordinator proposes the next issue and starts its thread.
- The coordinator posts to Ale only when something is done, blocked, or needs a decision.
- Plain English for Ale: lead with the outcome and its impact; no step-by-step narration; say plainly what wasn't verified.
- Before big work, a short plan and Ale's OK.
- **Ale does a manual step only when Claude genuinely can't.** Anything Claude can do itself it does, without handing Ale paste or click instructions (e.g. the coordinator applies the Project instructions itself). It can't edit the Project's "What do you want to work on?" text, repo Settings or delete branches. When a manual step is really needed, give exact, complete, copy-ready instructions.
- Never put secrets in the repo, issues or chat.

## 9. Repo settings that protect `main`

Set by Ale once in GitHub (Claude can't change repo settings) and checked on 2026-11-10 by a test PR that stayed blocked until `check` went green. Auto-merge is on since the rule switch (2026-11-15): the tier (below) decides which PRs wait for Ale's OK.

- **Settings → General → Pull Requests:** only "Allow squash merging" ticked; "Automatically delete head branches" ticked; "Allow auto-merge" ticked (Ale's click at the rule switch). Until it is ticked, threads merge a green PR directly.
- **Settings → Rules → Rulesets → "main protection":** enforcement Active, empty bypass list, target the default branch, rules: restrict deletions, block force pushes, require status checks to pass with `check` (GitHub Actions) and "up to date before merging". No "require a pull request" rule, so Claude can still push its branch.
- `check` is skipped on a draft, so a draft PR can never merge; open PRs ready for review (section 5).
- **Branches of closed, unmerged PRs are not deleted automatically**, and Claude has no tool to delete them: ask Ale for the "Delete branch" click, or avoid test PRs that end unmerged.
- **Ale's OK label:** GitHub doesn't offer required reviewers on environments for this private repo, so there is no tap Claude can't press. Instead `check` fails for a PR in Ale's tier until it carries the label `ale-ok`. A thread adds that label only after Ale's OK in the thread, and CI removes it on every new push, so the OK has to be given again. It stops mistakes, not a deliberate bypass (tested on PR #51). If the repo ever gets a plan with environment reviewers, replace it with a required reviewer.
- **Risk tier:** `scripts/tier.mjs`, run inside `check` as it is on `main`, sets each PR's tier from the paths it changes (Ale's, live check before apps, or auto), prints it on the run's summary, and sends unknown files to Ale. A thread can only raise a tier, with the label `tier:ale`. For `docs/GOVERNANCE.md` and `docs/studio-project-instructions.md`, a diff check lets wording-only edits through (at most 30 words, no rule word or number, no heading, list item or table row added, removed or moved). The tier decides who merges (section 5): Ale's OK for Ale's tier, auto-merge for the rest.
- **A PR can't change how it is judged:** `.github/workflows/ci.yml` runs only from `main` (`pull_request_target`; job `check` is part of that run), so a PR's own edit of it has no effect until it is merged, and any change under `.github/` is Ale's tier. The tier and release check run the scripts as they are on `main`; the PR's tests run in a read-only job. `scripts/ci-guard.test.mjs` fails if a job with write access checks out PR code. This does not stop someone with push access who adds a second workflow of their own that reports a `check`: the tier and label are a tripwire against mistakes, as above.
- **Off switch:** Settings → Secrets and variables → Actions → Variables → New repository variable `ALL_NEED_ALE` = `true` sends every PR to Ale's tier; delete it to turn the tiers back on.
