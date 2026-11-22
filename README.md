# app-studio

The master copy of the harness the App-Studio Owner and Claude use to build apps: skills, agents, hooks and a CLAUDE.md template. Nothing here is about one app; each app describes itself in an **App profile** at the top of its own `CLAUDE.md`.

## How it's meant to be used

- **One Claude Code Project per app**, with `app-studio` and the app repo attached and the **"app-studio apps"** cloud environment selected. The coordinator plans and starts one thread per backlog item; threads do the work.
- **app-studio changes only in its own Project** (or a session with only `app-studio` attached), on the Default cloud environment.
- **Apps pull** released harness changes (`harness-sync`, part A) and **send ideas back** as GitHub issues labelled `harness-idea` (`harness-idea` skill). They never change app-studio.

## One-time setup: the "app-studio apps" cloud environment

Threads in a Project start in the folder above the repos, so they load none of the app's skills, agents or hooks by themselves. The environment's setup script fixes that before each thread starts.

1. claude.ai → Claude Code → Settings → Environments → new environment named **app-studio apps**.
2. Setup script: paste the whole of [`scripts/env-setup.sh`](scripts/env-setup.sh). Network: package registries allowed, plus any host an app's stack needs.
3. Every thread on it then starts with "Studio harness loaded …". With only app-studio attached, it loads the `new-app` skill; once the app has the harness, the app's own skills, agents and hooks, its dependencies and the browser path. Log: `/tmp/studio-env.log`.

The setup script installs only a small launcher and the hook wiring; on every thread start and hook, the launcher runs the current [`scripts/studio-env.mjs`](scripts/studio-env.mjs) from the app-studio checkout, and skills and agents are links into the repos. So app-studio updates reach threads by themselves, even though the environment's setup is cached between threads. Paste the script again only when `scripts/env-setup.sh` itself changes (the changelog says so as an **Admin action**).

## Two update paths: what changes by itself, and what doesn't

| What | Comes from | When it changes |
| --- | --- | --- |
| **The loader** (`scripts/studio-env.mjs`): links skills and agents, gets the app ready, passes on hooks | app-studio's `main`, read live | the next thread in any app's Project, with nothing for you to do |
| **The harness content**: skills, agents, hook scripts, templates, pack docs | the app's own pinned copy (`.claude/studio/lock.json`) | only when that app runs `harness-sync` |

So a thread does **not** always run "the latest harness": it runs the latest loader over the app's pinned content. The pinning is deliberate: an app updates on purpose, and its own CI needs its copy because GitHub can't see app-studio. Because the loader reaches every app at once, it must keep working with every app copy from 0.6.0 on (a test in `scripts/studio-sync.test.mjs` checks this). `scripts/env-setup.sh` is the exception to "nothing to do": a change to it needs you to paste it into the environment again, so we avoid changing it. [`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) section 6 has the rules.

## Known limits

Check these before you pick the harness for an app. Each is a choice for now, not a bug. If your app needs more than one of these allows, send a `harness-idea` before you build around the gap.

- **One owner.** Built for one non-coding product owner and one GitHub owner (`docs/GOVERNANCE.md` section 1). There are no roles, reviewers or teams, and nobody else approves risky changes.
- **Static sites.** A content site with no server runs on Cloudflare's free static hosting (the `static-site` pack): no sign-in, database or AI, and its PR preview links are public unless Cloudflare Access is switched on. More detail: `packs/static-site/managed/STACK.md`.
- **Web hosting.** A website runs on one provider (Render, a paid plan), as one server instance, with Postgres. Sign-in limits and AI allowances are counted in that instance's memory, so a second instance, or a restart, resets them. More detail: `packs/web/managed/STACK.md`.
- **Storage shape.** Data is JSON documents by path, private to each person or shared by everyone. There is no relational data, no file uploads and no teams or groups. A `files` or `relational` module will be added only when an app needs one.
- **AI in a no-login app.** A web app with no login cannot offer AI to visitors yet: the AI allowance is per signed-in person. Tracked in #98 (a site-wide cap).

## Start a new app

1. Create a Claude Code Project. In **Settings → Environment**, attach `app-studio` (and the app's empty repo, if you made one) and select the **app-studio apps** cloud environment.
2. Paste this into the coordinator:

   > Start a new app with app-studio. Start a thread (Sonnet) that runs the `new-app` skill; if the skill isn't in its list, it reads `app-studio/plugins/studio/skills/new-app/SKILL.md` and follows it. Relay its questions to me. When it reports the Project setup, apply the Project instructions and model settings it gives, then give me its checklist of what only I can do.

3. Answer the product questions. Anything only you can do comes as exact clicks: the one-time repo settings that let PRs merge themselves (auto-merge, deleting merged branches, a ruleset on `main` requiring the `CI gate` and `health` checks), and when needed creating the GitHub repo, picking the environment or adding a secret.
4. Approve the proposed text for the Project's **What do you want to work on?** box.

From then on, threads open each PR, merge it at once if its checks already passed (else switch on auto-merge) and move on: GitHub merges it when its checks are green and deletes the branch.

In app-studio itself, the same applies to low-risk changes (docs, tests, changelog); riskier ones wait for the App-Studio Owner's OK first ([`docs/GOVERNANCE.md`](docs/GOVERNANCE.md) sections 5 and 9).

## How apps carry the harness

Each app carries a pinned copy, so it works in Projects, cloud sessions and local sessions alike:

- `node scripts/studio-sync.mjs install --app ../<app>` copies the core into the app's `.claude/` and writes `.claude/studio/lock.json` (studio version plus a hash per file). It also adds `CLAUDE.md` and `.claude/settings.json` from `plugins/studio/templates/` if the app has none.
- In the app, `node .claude/studio/studio-sync.mjs check` reports files that are behind app-studio, edited locally or missing. The template's SessionStart hook runs it with `--warn`, so a session sees a warning when its copy is out of step. It finds app-studio through `--studio`, `$STUDIO_DIR`, a sibling `../app-studio` checkout, or any sibling folder that is an app-studio checkout (cloud sessions clone attached repos side by side); without one it checks local edits only.
- `node .claude/studio/studio-sync.mjs health` checks that the harness is sound before any code: shared files unedited and present, App profile filled in, hooks wired in `settings.json`, the app's own skills and agents well formed, doc links working. Being behind app-studio is only a note. It runs before every `git commit` Claude makes (a PreToolUse hook in the template's `settings.json`) and in the base pack's `Harness` workflow, on PRs that touch `.claude/`, Markdown or workflows.
- Every `studio-sync.mjs` command run in an app also turns on the hooks that don't depend on where a session starts: the git pre-commit hook, and in a cloud session with several repos attached (whose top folder is the parent, so the app's `settings.json` never loads) the app's Claude Code hooks forwarded to the parent folder's settings. `hooks` does only that.
- `node .claude/studio/studio-sync.mjs pull` brings the copy up to date. The `harness-sync` skill walks through it.
- `node .claude/studio/studio-sync.mjs pack add <name…>` adds stack packs (docs kept in step, plus starter files the app owns from then on).

The same files also work as a Claude Code plugin (`studio@app-studio`) for sessions outside an app repo, such as starting a new app. Don't enable the plugin in an app repo that carries the copy: the skills would show up twice.

## Layout

| Path | What |
| --- | --- |
| `plugins/studio/skills/` | `prd-intake`, `build-feature`, `test-handoff`, `release`, `new-app`, `harness-sync`, `harness-idea`, `migrate-app` |
| `plugins/studio/agents/` | `planner`, `reviewer`, `qa` |
| `plugins/studio/hooks/check.mjs` | Lint on edit, unit tests when a turn ends, harness health before a commit, a merge gate (checks read and green), a block on GitHub API file writes |
| `plugins/studio/hooks/pre-commit` | Git pre-commit hook: the health check for every commit, wherever the session started (`studio-sync.mjs hooks` turns it on) |
| `plugins/studio/hooks/cloud-setup.mjs` | Cloud sessions only: installs dependencies and sets up the browser when a session starts |
| `plugins/studio/templates/` | `CLAUDE.md` (shared rules plus an App profile to fill in), `settings.json`, and `project-instructions.md` (the text `new-app` fills in for the Project's instructions) |
| `scripts/env-setup.sh` | Setup script of the "app-studio apps" cloud environment: installs the launcher that loads the harness in every Project thread |
| `scripts/studio-env.mjs` | What the launcher runs at each thread start and hook: links skills and agents, gets the app ready, runs the app's hooks |
| `packs/` | Stack packs: `base`, `artifact`, `web`, and the optional `mirror` (build and CI configs, release steps, QA and review checklists); feature modules: `ai` |
| `scripts/studio-sync.mjs` | Install, check, health-check and pull an app's copy; add stack packs |
| `scripts/packs-smoke.mjs` | Builds a scratch app from the packs |
| `scripts/coherence-lint.mjs` | Fails on skill drift: bad skill front matter, skill lists out of step, the old persona name, studio-only wording in what apps get, unknown `studio-sync` commands. The judgement review is `docs/COHERENCE-REVIEW.md` (on request only) |
| `scripts/core-lint.mjs` | Fails if the core names an app or a stack detail, or a pack names an app |

Stack packs (`base`, `artifact`, `web`, optional `mirror`) and feature modules (`ai`) are in `packs/`; see `packs/README.md`.

## Changing the harness

**Read [docs/GOVERNANCE.md](docs/GOVERNANCE.md) first.** It is the rulebook: app-studio changes only in its own Project, from GitHub issues (`harness-idea` from apps, `studio-backlog` accepted), with the owner's OK for risky changes, and it explains how changes reach apps. The Project's instructions are in [docs/studio-project-instructions.md](docs/studio-project-instructions.md). In short, change it here, never in an app's copy: bump `version` in `plugins/studio/.claude-plugin/plugin.json`, add a `CHANGELOG.md` entry (mark manual steps for apps as **App action**), and run the checks:

```sh
node --test scripts/studio-sync.test.mjs
node scripts/core-lint.mjs
node scripts/packs-smoke.mjs   # after changing a pack
```

Versions live in `plugin.json` and the changelog; no git tags are needed, because apps pin file hashes.
