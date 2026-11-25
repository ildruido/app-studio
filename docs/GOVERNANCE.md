# How app-studio evolves

This is the rulebook for changing app-studio itself. It is permanent: change it only through a PR, and a change to a rule needs the App-Studio Owner's OK (section 5). For the history behind these rules, see the archived [handover](archive/HANDOVER-2026-11.md).

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
- **Never from an app's Project or session, with no exception:** no approval lifts it, and that includes marking a release `Live check: passed` (only the studio Project does that, section 7). Apps send ideas (section 3) and pull released changes (section 6). The app rules say so without exception, and the harness's write, merge and git hooks refuse writes, merges, approvals and pushes to app-studio from an app (issues stay open for `harness-idea`). Claude's GitHub access is the person's own, so this is a strong guard, not a lock; the protections in section 9 still hold.
- **One exception, the live-check mailbox (2026-11-24):** a thread may post reviews and comments on the two never-merged draft PRs of `studio-scratch` (#71 requests, #72 results), and nothing else there, never files. See `docs/LIVE-CHECK-RUNNER.md`.
- The app-studio Project runs on the **Default** cloud environment, not "app-studio apps": the latter is for apps, and would load the harness as if app-studio were an app.

## 3. How ideas come in

There is one queue: **GitHub issues on app-studio**.

| Label | Meaning |
| --- | --- |
| `harness-idea` | An idea sent from an app's Project with the `harness-idea` skill: what happened, which harness file, a suggested change. Not yet triaged. |
| `studio-backlog` | Accepted work for app-studio, from triage or created directly in the app-studio Project. |

Ideas from the App-Studio Owner in conversation become an issue first (a `studio-backlog` issue, written by Claude), so nothing lives only in a chat.

- **Filing:** apps file ideas with the `harness-idea` skill, which uses the `Harness idea` issue template (`.github/ISSUE_TEMPLATE/harness-idea.yml`): the label, the title prefix `[harness-idea]`, the App name and the Harness version. The skill's duplicate check also looks at unlabelled issues by title prefix and area name.
- **One label rule for lessons from live checks and migrations:** they come from an app Project (studio-scratch included), so they are filed as `harness-idea` like any other idea and triaged the same way. Issues the studio Project writes itself (from the App-Studio Owner or from its own analysis) are `studio-backlog` from the start.

## 4. Triage

When the App-Studio Owner asks, or at the start of a batch of work, the coordinator goes through every open `harness-idea` issue:

- **Accept:** relabel it `studio-backlog`, and add a line on why and on what it depends.
- **Merge:** if another issue covers it, comment there with the new evidence and close this one as a duplicate.
- **Decline:** close it with a one-line reason the reporting app can understand.

**The trail.** Closing an idea always leaves exactly one comment: the release and the PR that fixed it (for example "Fixed in 0.22.1 (PR #130)"), or the decline reason, or the issue it duplicates. An idea that is accepted is relabelled `studio-backlog` at that moment, not when it closes. The comment names the release because the reporting app learns of it at its next `harness-sync`, which lists the app's own fixed and declined ideas.

Claude recommends; the App-Studio Owner decides anything that changes how they work or what apps do. The order of work is the order the App-Studio Owner gives; without one, issues that hurt every app's daily use come first, then safety, then new capability.

## 5. Building a change

- **One thread per issue** (or per small group of related issues), on Sonnet at medium effort. Opus only for risky designs, or after a thread fails twice.
- Read the issue, this file, the README and the files involved before changing anything. Don't re-derive what an issue or the handover already settled.
- **Keep the core generic:** app facts go in an app's App profile, stack facts in a stack pack. `node scripts/core-lint.mjs` must pass.
- **Checks before a PR:** `node --test scripts/studio-sync.test.mjs`, `node scripts/core-lint.mjs`, `node scripts/coherence-lint.mjs`, and `node scripts/packs-smoke.mjs web artifact` when a pack changed. The required `check` runs all of these on every ready PR, plus `node scripts/release-check.mjs --base origin/main`, which fails when harness files changed without a raised plugin version and its release record, or a pack changed without its own version bump. A fix comes with a test that fails without it.
- **Skills:** a new skill, or a change to a skill's description or behaviour, is drafted and checked with Claude's account skill `anthropic-skills:skill-creator` (tune the description, run a few test prompts). The PR hand-over says what was tested. Typo and wording-only fixes are exempt. The key skills (`build-feature`, `new-app`, `harness-sync`) also get a deeper check: a few more test prompts covering their main paths. skill-creator is not copied into the repo; if it isn't available in the session, the thread stops and tells the App-Studio Owner. The studio-scratch live check (section 7) stays as it is.
- **Coherence review:** after a change to this file, a skill, the app template or the coordinator routing, the coordinator or thread proposes a coherence review (`docs/COHERENCE-REVIEW.md`, skill `coherence-review`) in one line with its rough cost. It runs only after the App-Studio Owner says yes; it is never scheduled.
- **Version and release record** (`plugins/studio/.claude-plugin/plugin.json`, `releases/<version>.json`): PATCH for wording and fixes, MINOR for a new skill, agent, hook, profile field or workflow change. Each release has one JSON record, made with `node scripts/release.mjs new` and filled in by the thread: a short summary phrase, the issue and PR numbers, what changes for the App Creator, numbered **App action** and **Admin action** steps (each app does the first at its next sync; the Admin does the second once, e.g. pasting the environment's setup script again), the checks and what was not verified. `CHANGELOG.md` is written only by `node scripts/release.mjs render` from the records; nobody and no model edits it, and `check` fails if it differs. Releases up to 0.36.2 are frozen in `docs/CHANGELOG-legacy.md`. A release that changes what apps get (skills, agents, hooks, templates, packs, the sync tool) has `status.main` `pending` in its record, shown as `Live check: pending`: `install`, `pull` and `pack add` refuse it, so no app takes it. After the studio-scratch check (section 7), `node scripts/release.mjs pass-main <version>` in a small PR sets it to `passed <date>`. A pack change also bumps that pack's `version` in `pack.json`.
- **Scenarios, written first** (`releases/scenarios.json`): each live check is one catalog entry (id, title, `branch` or `main`, whether it needs a fresh studio-scratch thread, the prompt studio-scratch runs, and pass rules that code reads on GitHub: PR state, checks, files, expected output, never Claude's summary). The build thread writes or updates the scenario before the code, next to the failing unit test, and a new scenario is not first run red on `main`. The record names only the scenarios that release needs (`checks.branch`, `checks.main`); only those are run, never the whole catalog. Floor, enforced by `release.mjs validate`: an app-facing release names at least one branch scenario or `none` with a reason; a loader or setup release also names at least one `main` scenario.
- **PR:** an internal-only PR is opened ready for review. An **app-facing** PR (it changes plugins, packs, the sync tool, the loader or the setup script) is opened as a **draft** and marked ready only after its branch live check passed (section 7): `check` is skipped on a draft, and once ready, CI's branch gate (section 9) fails it unless a passing result exists for the PR's current app-facing changes. **The merge queue** (section 9) lets only one app-facing PR at a time be live-checked and merged: after opening the draft the thread waits for its `QUEUE-TURN` comment, then updates the branch from `main`, requests the live check and goes ready. Both are titled with a Conventional Commit, `Closes #<n>` for the issues it settles, and a hand-over in the description: what changed, what's left, how to test, **what wasn't verified**.
- **Merging follows the PR's tier** (section 9; CI sets it from the files the PR changes and prints it on the run):
  - **the owner tier** (the loader, the setup script, CI and the tier rules, unknown files, a rule file unless only its wording changed, a lost test, a changelog **App action** or **Admin action**, more than about 400 lines): merged only after the App-Studio Owner's OK in the thread. The thread then adds the label `owner-ok` and merges. The OK covers the PR's own changes: updating the branch because `main` moved keeps it, and any change to the PR's own diff removes the label, so the OK has to be given again.
  - **Every other tier** (what apps get, other docs, added tests, the changelog): the thread that opened the PR reads it first: if `check` is already green and the PR is mergeable, it squash-merges straight away (GitHub refuses auto-merge when there is nothing to wait for); otherwise it switches on auto-merge (squash) and GitHub merges when `check` is green. If auto-merge is off in the repo, the thread merges once green. Never around a required check or approval. A PR that apps get carries `Live check: pending`, so apps can't pull it before the studio-scratch check (section 7), and it cannot merge before its branch check passed.
  - A thread can raise a PR's tier with the label `tier:owner`, never lower it.
  - **Follow your own PR.** Right after opening it the thread subscribes to its activity (`subscribe_pr_activity`) and also schedules a check-in about 3 minutes out (`send_later`), because an event can be missed. On a wake-up or event it reads the PR itself: a red check is fixed and pushed, a merge ends the follow-up. It never waits for the App-Studio Owner to say what happened. It confirms the PR is actually merged before it hands back (if not, it says why), unsubscribes (`unsubscribe_pr_activity`) once the PR is merged or closed, and reports green or red either way.

## 6. How changes reach apps: two paths

| What | Where apps get it | When |
| --- | --- | --- |
| **The loader**: `scripts/studio-env.mjs`, run by the "app-studio apps" environment's launcher at every thread start and hook | app-studio's `main`, directly | the next thread in any app's Project |
| **The harness content**: skills, agents, hook scripts, templates, stack pack docs | the app's own pinned copy (`.claude/studio/lock.json`) | only when that app runs `harness-sync` |
| **Pack starter files**: CI workflows, configs, server code | copied once into a new app; the app owns them | new apps; existing apps only by an **App action** |
| **The environment's setup script**: `scripts/env-setup.sh` | pasted into the "app-studio apps" environment by the Admin | only after an **Admin action** |

Rules that follow from this:

- **Loader changes are branch-tested like other app changes** (#227): the launcher runs `scripts/studio-env.mjs` from the app-studio checkout at every hook, so a studio-scratch thread whose checkout is on the PR's commit runs the branch loader from its next hook on, and each hook logs `loader <version of that checkout>` in `/tmp/studio-hooks.log`. Only the thread's first start-up (SessionStart) and `scripts/env-setup.sh` stay `main`-only. A loader release therefore names a branch scenario (`loader-follows-checkout`) and a `main` one. If a live check ever shows that a moved checkout does not run its own loader, the fallback is a `loader-stable` tag that apps read, moved only after the `main` check passes; that needs one Admin paste of the setup script.
- **The loader must keep working with every app copy from 0.6.0 on.** It reaches all apps at once, with no sync step to stop it. A test in `scripts/studio-sync.test.mjs` ("the current loader works with an app copy as old as 0.6.0") guards this; when the loader starts to need something an old copy lacks, the change must handle the missing piece, not drop the old copy.
- **Avoid changing `scripts/env-setup.sh`**: each change needs the Admin to paste it again. Put logic in `scripts/studio-env.mjs` instead.
- **Rolling out to apps:** an app pulls a release with `harness-sync` part A, in a thread of its own Project, when the App Creator asks. Give the App-Studio Owner one line per app to paste into that app's coordinator. For changes with App actions or risk, migrate **one app at a time**, with a written plan and a way back, and verify with one small PR that merges by itself before moving to the next.

## 7. Verifying in a real Project

Unit tests can't show how Claude Code behaves in a Project thread: what loads at start-up, what a thread can see, how notifications behave. There are two cases:

**(a) Changes that apps experience** (the loader, the bootstrap, the merge flow, the app template's instructions) are verified **live**, twice: on the branch before they merge (D1), and on `main` after in the **studio-scratch** Project (a disposable artifact app, a repo named `studio-scratch` under the same GitHub owner, an app Project) before they are called done:

0. **Branch check first.** The PR is a draft. The build thread runs `node scripts/live-check.mjs request` (it adds the fingerprint of the PR's app-facing changes), posts it as `docs/LIVE-CHECK-RUNNER.md` says, and when the result passes marks the PR ready. A new run is needed only when the app-facing changes themselves change; merging `main` into the branch keeps the result. An internal-only PR, or a record whose `checks.branch` is `none` with a reason, needs no scratch run. A loader or setup release always has branch scenarios and merges with `status.main` `pending`.
1. Merge the change (as section 5 says); its record says `pending` (shown as `Live check: pending`), so apps can't pull it yet.
2. In the studio-scratch Project, run the one prompt that exercises it (a new feature thread, a harness sync, a fresh `new-app` on an emptied repo); the sync or install commands there take `--live-check`, which only this check uses.
3. Read the result on GitHub yourself (PR state, checks, branches) instead of trusting the thread's summary, and report what passed and what wasn't checked.
   The check runs through the mailbox, by code: the build thread that needs it posts a fixed-format request (`scripts/live-check.mjs`), a standing studio-scratch runner thread acts out the scenarios, code judges the pass rules and posts the result, and the build thread reads it. One run at a time; a run that never starts or times out counts as failed (`docs/LIVE-CHECK-RUNNER.md`).
4. When it passed, open a small PR that runs `node scripts/release.mjs pass-main <version>` (it sets the record to `passed <date>` and renders `CHANGELOG.md`); from then on apps can pull the release.

**(b) Changes to app-studio's own instructions or rules** (this file, `docs/studio-project-instructions.md`) get **no studio-scratch check**: it is an app Project and never sees them. When the change matters, check it with a fresh thread in the app-studio Project.

## 8. Ways of working (studio Project; the app template has its own copy)

- One thread per issue; never resume a thread that has been idle for over an hour. Start a new one that reads the issue and the PR.
- **A thread stays inside its issue.** When the work is done or blocked it hands back and stops; it never proposes, plans or starts the next issue or phase. Only the coordinator proposes the next issue and starts its thread.
- The coordinator posts to the App-Studio Owner only when something is done, blocked, or needs a decision.
- **Point, don't repeat.** When a thread hands back something for the App-Studio Owner to act on (a test, an OK, a live-check prompt, a manual step), the coordinator sends one short line with a link to that thread and what is needed, instead of repeating the thread's report. A product decision about a thread's own work is asked and answered in that thread. The coordinator summarizes instead when several threads are in parallel and one merged action or recap is more efficient, or when the matter spans more than one thread (ordering, the next issue). The App-Studio Owner can ask the thread for a shorter recap.
- Plain English for the App-Studio Owner: lead with the outcome and its impact; no step-by-step narration; say plainly what wasn't verified.
- Before big work, a short plan and the App-Studio Owner's OK.
- **The Admin does a manual step only when Claude genuinely can't.** Anything Claude can do itself it does, without handing the Admin paste or click instructions (e.g. the coordinator applies the Project instructions itself). It can't edit the Project's "What do you want to work on?" text, repo Settings or delete branches. When a manual step is really needed, give exact, complete, copy-ready instructions.
- Never put secrets in the repo, issues or chat.

## 9. Repo settings that protect `main`

Set by the Admin once in GitHub (Claude can't change repo settings) and checked on 2026-11-10 by a test PR that stayed blocked until `check` went green. Auto-merge is on since the rule switch (2026-11-15): the tier (below) decides which PRs wait for the App-Studio Owner's OK.

- **Settings → General → Pull Requests:** only "Allow squash merging" ticked; "Automatically delete head branches" ticked; "Allow auto-merge" ticked (the Admin's click at the rule switch). Until it is ticked, threads merge a green PR directly.
- **Settings → Rules → Rulesets → "main protection":** enforcement Active, empty bypass list, target the default branch, rules: restrict deletions, block force pushes, require status checks to pass with `check` (GitHub Actions) and "up to date before merging". No "require a pull request" rule, so Claude can still push its branch.
- `check` is skipped on a draft, so a draft PR can never merge; open PRs ready for review (section 5).
- **Branches of closed, unmerged PRs are not deleted automatically**, and Claude has no tool to delete them: ask the Admin for the "Delete branch" click, or avoid test PRs that end unmerged.
- **The owner OK label:** GitHub doesn't offer required reviewers on environments for this private repo, so there is no tap Claude can't press. Instead `check` fails for a PR in the owner tier until it carries the label `owner-ok`. A thread adds that label only after the App-Studio Owner's OK in the thread, and adding it records a fingerprint of the PR's own changes (a comment by CI). The OK stays valid while that fingerprint is unchanged, so updating the branch because `main` moved keeps it; CI removes the label when the PR's own changes differ, and then the OK has to be given again. It stops mistakes, not a deliberate bypass (tested on PR #51). If the repo ever gets a plan with environment reviewers, replace it with a required reviewer.
- **The branch live-check gate:** job `gate` in `check` runs `scripts/branch-gate.mjs` from `main`. For a PR that changes app-facing files it reads the results on studio-scratch PR #72 with a read-only token (repo secret `LIVE_CHECK_TOKEN`, set once by the Admin) and fails unless a result passed every scenario named in the record's `checks.branch` for the PR's current fingerprint. Results come from the runner's code, never typed by the build thread; if #72 can't be read, the gate fails closed. A loader or setup release also fails if its record is not `pending`. Internal-only PRs never touch it. The gate and the tier rules it sits in (`scripts/branch-gate.mjs`) are the owner tier.
- **The merge queue:** workflow `merge-queue` (`scripts/merge-queue.mjs`, from `main`, no PR code) queues every open PR to `main` that changes app-facing files, draft or ready, oldest PR number first; any PR can be added with the label `queue`, and removing the label from an app-facing PR changes nothing. It comments `QUEUE-WAIT` (who is ahead) or `QUEUE-TURN` on the PR, which its build thread is subscribed to, and switches on auto-merge for the first PR once it is ready. Job `queue` in `check` fails a queued PR that is not first, so a PR cannot merge out of turn; when the one ahead merges or closes, the next PR's thread updates its branch from `main` and that push reruns `check`. Comments and auto-merge made with the workflow token start no CI run, so the workflow cannot update the branch itself, and a half-hourly run is the safety net. A stalled PR holds the queue until it is closed. GitHub's own merge queue is not offered for a private repo on a personal account. Small related changes share one PR and one run.
- **Risk tier:** `scripts/tier.mjs`, run inside `check` as it is on `main`, sets each PR's tier from the paths it changes (owner tier, live check before apps, or auto), prints it on the run's summary, and sends unknown files to the owner tier. A thread can only raise a tier, with the label `tier:owner`. For `docs/GOVERNANCE.md` and `docs/studio-project-instructions.md`, a diff check lets wording-only edits through (at most 30 words, no rule word or number, no heading, list item or table row added, removed or moved). The tier decides who merges (section 5): the App-Studio Owner's OK for the owner tier, auto-merge for the rest.
- **A PR can't change how it is judged:** `.github/workflows/ci.yml` runs only from `main` (`pull_request_target`; job `check` is part of that run), so a PR's own edit of it has no effect until it is merged, and any change under `.github/` is the owner tier. The tier and release check run the scripts as they are on `main`; the PR's tests run in a read-only job. `scripts/ci-guard.test.mjs` fails if a job with write access checks out PR code. This does not stop someone with push access who adds a second workflow of their own that reports a `check`: the tier and label are a tripwire against mistakes, as above.
- **Off switch:** Settings → Secrets and variables → Actions → Variables → New repository variable `ALL_NEED_OWNER` = `true` sends every PR to the owner tier; delete it to turn the tiers back on.
