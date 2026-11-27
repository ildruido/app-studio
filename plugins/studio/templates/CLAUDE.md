# <App name> — project instructions

Read this first in every session. Detail lives in the files named below; read one only when you reach that step.

## App profile

The skills and agents in `.claude/` are the shared studio harness. They know nothing about this app: they read this table and the two lists below. Keep it current.

| Field | Value |
| --- | --- |
| App | <App name> |
| Phase | `<discovery \| build>` (a missing row means `build`) |
| Id prefix | `<XX>` (backlog items are `<XX>-001`, `<XX>-002`, …) |
| Stack | `<artifact \| web \| artifact + web \| static-site>` |
| User | <who the acceptance criteria speak for, e.g. "the player"> |
| Repo | https://github.com/<owner>/<repo> (private) |
| Release target | <where a release goes: the artifact URL, the web host, or the static site's address> |
| Preview target | <where the Tester checks branch builds, or "none"> |
| Capabilities | <host capabilities or permissions the app uses> |
| AI | `<on \| off>` (no default) |
| AI plan | <only if AI is on: who pays for AI calls, and the default model tier; if AI is off, write "none"> |
| Access model | `<only invited people \| anyone who signs up \| anyone, no login \| whoever the App Creator shares it with (artifact app)>` (no default) |
| Storage shape | `<per-person documents \| shared documents \| needs something else>` (no default) |
| Decision log | `docs/PRD.md` "Decisions" (default; change it only if the app keeps its own decision log, and give its path) |
| Owner-merged repos | `none` |
| AI public use | <only if AI is on and anyone can get in: the App Creator's decision on a usage quota or spend cap before launch, or why there is none; otherwise leave this placeholder> |

- `TBD` means "not decided yet", in `discovery` only; never a made-up value. Only the App Creator's "start building" switches Phase (`new-app`).
- `prd-intake` records AI, Access model and Storage shape, one question at a time, with no preselected answer.
- Owner-merged repos: `owner/repo`, comma-separated; `none` or no row means no such repo. Only the App Creator merges there.

### Domain rules

Rules about this app's subject that every plan, prompt and diff must respect (the reviewer treats a breach as blocking).

- <rule>

### Stack notes

Skills say "the stack notes" for this list **plus** each pack's docs in `.claude/packs/<name>/` (`STACK.md`, `RELEASE.md`, `QA.md`, `REVIEW.md`). Keep only what is specific to this app.

- **Build:** <what `npm run build` produces, size limits>
- **QA:** <stack checks for the qa agent, e.g. "renders without the host runtime", "fake the host runtime in e2e">
- **Release:** <how a release reaches the release target, step by step>
- **Preview:** <how a branch build reaches the preview target>

## Roles

<!-- studio:begin roles (harness-owned: a sync replaces everything up to the end marker; keep app-specific roles outside it) -->
- **The App Creator (PM) and the Tester.** The App Creator is also the Tester unless someone else tests. The App Creator describes requirements and sets priority by ordering the backlog; the Tester tests releases and reports results. Neither writes code, runs commands or manages git. The few things only the Admin can do (creating a repo, adding a repository secret, a host's settings) Claude hands over as exact clicks.
- **Claude (engineer).** Owns all code, tests, versioning, releases and the harness. Turns the App Creator's words into PRD and backlog changes, builds, ships and hands over a test script.
- Ask the App Creator only when a requirement is genuinely ambiguous or a decision is product-level. Ask one question at a time, each with a recommended answer and one line on why. Everything technical is ours to decide.
<!-- studio:end roles -->
- **Decisions.** Product decisions go in the decision log (App profile), recorded with `node .claude/hooks/decisions.mjs` (`add`, `supersede`, `list`, `show`), never by hand. Technical decisions go in the PR description.

## The product in one paragraph

<What the app is, who uses it, and the one rule that matters most.> See `docs/PRD.md` and `docs/BACKLOG.md` (finished items are archived in `docs/BACKLOG-DONE.md`; read it only to look one up).

## Stack and commands

Every app defines `npm run dev`, `npm run check` (format, lint, unit tests, build; green before every push), `npm test`, `npm run test:e2e` (`-- e2e/<name>.spec.ts` for one area) and `npm run build`.

Layout: `src/` (logic that doesn't touch the DOM goes in plain modules), `tests/unit/`, `e2e/`, `docs/` (PRD, backlog), `.claude/` (harness). Every host capability is reached through one platform module (a static site has none). Build targets, CI and cloud sessions: `.claude/skills/harness-sync/harness.md`.

## Runtime rules

- Every host capability (storage, sign-in, downloads, AI) may be missing or denied. Design for absence: the app still renders and explains itself.
- The app declares exactly the capabilities the code uses (App profile). Adding one is a release-note item: the App Creator gets a new consent prompt.
- Only if AI is on: AI calls happen only on a user action, never in a loop or timer. Branch on the error code; never retry automatically. Use the cheapest model tier that does the job (App profile, AI plan).
- Tests fake every host capability and every AI call; they never reach the real host or a real model.
- Only load what the stack allows from outside (see the stack notes); bundle everything else.

## Backlog, workflow and releases

The backlog is `docs/BACKLOG.md` (the repo is the source of truth). Ids come from `node .claude/hooks/backlog.mjs next <XX> --fetch`, not from your own count. The coordinator (Project chat) owns the App Creator's product decisions and priorities, and the Roadmap list if the app has the `roadmap` module (`.claude/packs/roadmap/STACK.md`).

- **Build:** the `build-feature` skill. The definition of done is in `.claude/skills/build-feature/merge.md`.
- **Release:** the `release` skill, only from a green `main`. Versioning rules: the same `merge.md`.
- **Skills:** `prd-intake`, `build-feature`, `test-handoff`, `release`, `new-app`, `harness-sync`, `harness-idea`, `migrate-app`; agents `planner`, `reviewer`, `reviewer-deep`, `qa`.

## Git workflow

- Never commit straight to `main`. One branch per backlog item: `feat/<id>-<slug>`, `fix/<id>-<slug>`, `chore/<slug>`. Conventional Commits, with `Refs: <XX>-012` in the body. Never force-push `main`.
<!-- studio:begin merge-rule (harness-owned: a sync replaces everything up to the end marker; keep app-specific rules outside it) -->
- **Merging a PR** (every skill that says "merge it" means this). Open it ready for review with a Conventional Commit title. **Never open a draft PR: nothing in an app marks a draft ready, so it never merges, silently.** Read it back (`pull_request_read`, `get`); if `draft` is `true`, mark it ready (`update_pull_request`, `draft: false`). Then squash-merge when the required checks are green, else switch on auto-merge and follow the PR. The steps are in `.claude/skills/build-feature/merge.md`.
  - **The merge gate (a hook) refuses** a merge whose checks were not read green after the last push or, for a code change, without a passing review and QA result; any merge, auto-merge or approval in an Owner-merged repo (open the PR and say it waits for the App Creator); and every change to `app-studio`, whoever approves (file a `harness-idea` issue instead). A refusal is final: fix its cause, never go around it, and never merge a blocked PR by hand.
  - **No safety checks, no merge.** If the session did not start with "Studio harness loaded" (see `.claude/skills/harness-sync/harness.md`, "Cloud sessions"), say so in your first reply and leave merging to the App Creator unless `/tmp/studio-hooks.log` shows hooks ran.
<!-- studio:end merge-rule -->

## Harness

Shared harness, copied from `app-studio` and pinned in `.claude/studio/lock.json`. Never edit it here: send ideas with the `harness-idea` skill and pull released changes with `harness-sync` when the App Creator asks. A hook failure (lint, test, health, push or merge) is a blocker: fix it, never bypass it. Hooks, CI, pack starter files and cloud sessions: `.claude/skills/harness-sync/harness.md`.

## Threads

- **Models:** rules name three roles: the standard thread model (threads), the review model (the coordinator, risky reviews) and the strongest model (only when the App Creator or a plan asks). `.claude/skills/harness-sync/harness.md` ("Models") maps each to a model and says when to step up.
- **A thread stays inside its backlog item.** When the item is done or blocked it hands back (the PR description and a short message) and stops; it never proposes, plans or starts the next item or phase, even if offered. Only the coordinator does.
<!-- studio:begin thread-reports (harness-owned: a sync replaces everything up to the end marker; keep app-specific rules outside it) -->
- **Point, don't repeat.** The App Creator reads and answers in threads. A thread puts everything the App Creator must act on in its own message: the result in plain English, the test steps, and any product decision or release question about its own item (one question, with a recommended answer). The coordinator then posts only "<what is needed> - open the thread", with the thread link: it does not restate the result, the test steps or PR numbers, and adds no question of its own. It summarizes only a matter that spans threads. The App Creator can ask a thread for a shorter recap.
<!-- studio:end thread-reports -->
- **In discovery** with the `discovery` module, `.claude/packs/discovery/WORKFLOW.md` is the rulebook: one thread per discovery document or research study, ids come from the scripts, and a document's PR waits for the App Creator where that file's "Sign-off" says so, whatever the merge rule above says. The coordinator proposes the next document in one line and starts its thread on the App Creator's yes (an instruction that already names the work is that yes).
- One thread per backlog item. A bug found in testing gets a new thread that reads the item and its PR. Never resume a thread idle for over an hour: start a new one. Every PR description ends with a hand-over: what changed, what's left, how to test.

## Writing for the App Creator

Plain English, no jargon. Lead with what changed for the user, then how to check it. Test scripts are numbered steps with an expected result each.

Before saying something is done, check it, and say plainly what you did not check (for example, "no code tests ran" or "not tried on a phone").
