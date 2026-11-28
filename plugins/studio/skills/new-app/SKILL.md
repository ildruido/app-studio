---
name: new-app
description: Start a new app in the studio - set up a fresh repo with the shared harness from app-studio, then create its PRD, backlog, Project settings and first release; also switches an app from discovery to build when the App Creator says "start building". Use when the App Creator asks for a new app, or when the start-up message says the harness is loaded but no app is set up yet.
model: inherit
---

# New app

`app-studio` is the master copy of the harness. A new app gets a pinned copy (`.claude/studio/lock.json`) and later pulls updates with the `harness-sync` skill, so fixes flow from `app-studio` to every app. Ideas flow back as issues (`harness-idea`), never as edits.

**Where this runs.** Best in a Claude Code Project on the "app-studio apps" cloud environment (app-studio `README.md`, "Start a new app"): the coordinator starts this skill in a thread, and the App Creator answers its questions there. It also works in a cloud or local session with `app-studio` and the app repo side by side. The App Creator answers product questions only; everything else is decided here.

## Branches (read the file only when it applies)

- **No stack decided yet** (step 2), or the App Creator says "start building" on a discovery app: read `${CLAUDE_SKILL_DIR}/discovery.md` and follow it with the steps below.
- **A static content site** (the `static-site` pack alone, no `base`; also a discovery app that becomes one): read `${CLAUDE_SKILL_DIR}/static-site.md`; its steps replace the ones it names.

## Steps

1. **Check the setup.** List the repos beside `app-studio` in the start folder.
   - **No app repo yet:**
     - Agree a short kebab-case repo name (`<app>`) and a 2-3 letter id prefix with the App Creator.
     - Ask the Admin (through the coordinator in a Project) to create one empty private repo with that name at github.com/new, with the exact clicks. Claude can't create repos.
     - In a Project, ask the coordinator to add the repo to the Project and start a **new** thread that runs `new-app` again, passing on the name and prefix. A running thread can't see a repo added after it started.
     - In a session, ask the App Creator to start a new session with both repos.
     - Stop here.
   - **The repo is attached but empty** (no commits, so no `main` to branch from):
     - Start `main` yourself with one GitHub call: `create_or_update_file` with path `README.md`, content `# <App name>`, message `chore: start the repo` and no branch. GitHub creates `main` from it.
     - Then `git fetch origin` and branch from `origin/main`.
     - If the session offers to create `main` instead, accept that. Don't ask the App Creator.
   - **The repo already exists with content** (for example after a discovery or inception phase with its own docs, skills and `CLAUDE.md`): read what is there first. Nothing is deleted: `install` and `pack add` never overwrite a file, and the existing docs become the input of step 8.
   - **Not on the "app-studio apps" environment** (no "Studio harness loaded" message at start-up): carry on, and add "select the cloud environment" to the Admin's checklist in step 12.
2. **Pick the start.** Ask the App Creator first: is the tech stack decided?
   - **Not yet** (the app is still being shaped, or is docs only): take the **discovery path** (`discovery.md`). Skip step 4's `pack add`, steps 6 and 7, step 9's npm commands, step 10's required checks and step 11.
   - **Decided:** ask one product question. Start as an artifact prototype (a private page in the Claude app, fastest to try), go straight to a web app (own sign-in and hosting), or build a **static content site** (pages and posts for everyone to read, no sign-in or server, free Cloudflare hosting)? Default: artifact prototype.
   - An artifact or web app has a platform layer from day one, so the other build can come later without rewriting features. Once a web version exists, the artifact build stays as a prototype with smoke tests only.
   - Turn the answers (here and in step 7) into the exact commands with `node .claude/hooks/app-setup.mjs pack-plan --target artifact|web|web+artifact|static-site --ai on|off --access invite|open|none|shared [--storage per-person] [--roadmap yes] --slug <repo> --title "<App name>"`. Don't work them out by hand.
   - The answer picks the stack packs: `artifact`, `web`, or `web artifact` for a web app that keeps a prototype (the first pack named decides what `npm run build` builds).
   - `static-site` goes **alone**: it replaces `base` and never goes with `web` or `artifact`. A site starts clean with it and follows `static-site.md`.
3. **Branch.** Work in the app repo's folder beside `app-studio` (clone it there in a local session), on a branch: `chore/bootstrap`, or the session branch in a cloud session or Project thread.
4. **Install the harness and the packs.**
   - `node ../app-studio/scripts/studio-sync.mjs install --app .` copies the skills, agents, hook script and sync script into `.claude/` and writes the lock. It adds `CLAUDE.md` and `.claude/settings.json` from the templates when they don't exist yet.
   - `node .claude/studio/studio-sync.mjs pack add <packs> --slug <repo> --title "<App name>"` adds the stack packs and the `base` pack they require: the packs' docs under `.claude/packs/`, the starter files, the npm scripts and the dev dependencies. It never overwrites a file the repo already has.
   - `npm install` (and `npm install --prefix server` for `web`).
   - If `install` or `pack add` stops with "not live-checked yet", app-studio's newest release still awaits its studio-scratch check and nothing was changed. Tell the App Creator and stop. Never pass `--live-check`; only the studio-scratch check does.
   - Optional `mirror` pack, for an app whose code must be public (open-source licences such as the GPL) while the project files stay private: add it now or later (`pack add mirror`). The setup is in `.claude/packs/mirror/RELEASE.md`.
5. **Fill the App profile** in `CLAUDE.md`.
   - Set rows with `node .claude/hooks/app-setup.mjs profile set "Field=value" ...`. Never retype the table.
   - Fill in the app name, id prefix, stack, user, repo, release and preview targets, capabilities, domain rules, stack notes and the product paragraph.
   - Read each pack's `STACK.md` and `RELEASE.md` once: the stack notes only add what is specific to this app.
   - Don't edit the copied skills, agents or pack docs. Anything app-specific belongs in the profile.
   - **If the repo already had a `CLAUDE.md`,** `install` kept it. Merge the template (`app-studio/plugins/studio/templates/CLAUDE.md`) into it by hand, so the App profile and the shared sections are there. Keep the old rules that still apply after the build starts (a decision log, writing rules); drop phase rules that end now (for example "no production code"). Project skills the repo already has stay; rename one that clashes with a harness skill.
6. **Stack files.** The pack's starter files are now the app's own code. Check that CI still starts no run for Markdown-only and `.claude/`-only changes and skips the browser tests for a version bump (the starter workflow does).
7. **Seed the app.** The packs already seed it (`index.html`, `src/main.ts`, the platform layer, a unit test and a browser smoke test per target), so CI has something real to run. The seed assumes no feature and makes no AI call. Replace the placeholder page only when the first backlog item is built. Then add the feature modules the App profile calls for (`packs/README.md`, "Modules"):
   - **AI on:** `node .claude/studio/studio-sync.mjs pack add ai` adds the AI status line and its tests. For a `web` app, `pack add ai-web` (which also adds `ai`) adds the server's AI endpoint, monthly allowance and usage ledger. A web app without AI has none of that.
   - **Who can get in** follows the App profile's Access model. If it isn't recorded yet, ask it now, as `prd-intake` "Features" does; there is no default.
   - For a `web` app, set `SIGN_IN_MODE` in `render.yaml` and in `.github/workflows/ci.yml`: `invite` for only invited people, `open` for anyone who signs up, `none` for anyone with no login. The server refuses to start until it is set.
   - Every access model with sign-in, and an artifact app with per-person documents, gets `pack add user` (who is using the page). A no-login app doesn't.
   - If AI is on and anyone can get in, raise the AI public use decision now (`prd-intake` "Features", question 4).
   - Ask the App Creator one process question: a prioritised Roadmap list (Now / Next / Later), kept honest by a check? Recommended; `node .claude/studio/studio-sync.mjs pack add roadmap` adds it. Without it the app has no Roadmap list and CI never asks for one.
8. **Requirements.** Run `prd-intake` to write `docs/PRD.md` and `docs/BACKLOG.md`, with the App Creator's description or the documents the App Creator points to (a spec or PRD, a Google or Claude Doc, the repo's discovery docs such as an MVP and roadmap). Start `CHANGELOG.md` with an empty `Unreleased` section.
9. **Verify.**
   - `npm run check` and `npm run test:e2e`. The web target needs Postgres: the pack's `scripts/cloud-setup.sh` starts one in a cloud thread and sets `DATABASE_URL` and `TEST_DATABASE_URL`; if the thread has none, CI runs them.
   - `node .claude/studio/studio-sync.mjs check` and `node .claude/studio/studio-sync.mjs health`. The commit hook runs `health` too and blocks commits until the App profile is filled in.
   - Commit the lockfiles.
10. **Merge, and let PRs merge themselves from now on.**
    - Push and open the PR (`chore: bootstrap harness`) ready for review (CLAUDE.md "Git workflow").
    - Once its checks have run (so their names exist on GitHub), **confirm `main` is the repo's default branch** (the PR's base branch, or `git remote show origin`: "HEAD branch"). If it isn't, the Admin's first click is switching it: project threads start from the default branch and the ruleset targets it.
    - Ask the Admin, through the coordinator in a Project, for the one-time repo settings as exact clicks: default branch `main`; only squash merging, auto-merge and delete-head-branches on; a `main` ruleset requiring the checks, with no up-to-date requirement. `node .claude/hooks/app-setup.mjs admin-checklist --repo <owner/repo> [--checks health] [--default-branch <name>]` prints them: pass that text on instead of retyping it.
    - **The setup is not done until GitHub says so.** Never decide it from the Admin's word, from a PR that merged, or because no Admin step seems needed. When the Admin says they're done, run `node .claude/hooks/app-setup.mjs repo-settings --repo <owner/repo> [--checks health]` (`--checks health` on the discovery path; the default also needs `CI gate`). It reads the merge settings and the rules on the default branch from GitHub and prints `REPO SETTINGS OK`, `MISSING` (with each missing setting) or `NOT CONFIRMED`; the last two exit 1. A missing setting goes back to the Admin as the exact click.
    - On `OK`, switch on auto-merge for this PR (`enable_pr_auto_merge`, `mergeMethod: SQUASH`); GitHub merges the PR when it's green. If GitHub says the PR is already clean, merge it now (`.claude/skills/build-feature/merge.md`, "Already clean").
    - **Until it prints `OK`, leave the merge to the App Creator** (open the PR ready for review and say so), and do not report the app as set up. This holds when the Admin can't do it now, when you are told to answer for the App Creator, and in a scenario run: the clicks need a person, so stop and say they are waiting.
    - From the next thread on, the environment loads this app's own harness, hooks included.
11. **First release.** Run the `release` skill for v0.1.0; record the new release target URL in the App profile.
12. **Project setup.** In a Project, end with one report to the coordinator. `node .claude/hooks/app-setup.mjs project-report --name "<App name>" --repo <owner/repo> [--studio ../app-studio] [--goal "<sentence>"] [--checks health] [--default-branch <name>] [--env-missing] [--cloudflare]` prints it in four parts: the Project instructions to set, the settings to apply (models and effort), a proposed outcome for the **What do you want to work on?** box, and the Admin's checklist as exact clicks.
    - You write only the proposed outcome: one or two sentences from the PRD's goal and first milestone. The coordinator asks the App Creator to approve it.
    - `--env-missing` only if this thread had no "Studio harness loaded" message at all.
    - Add to the Admin's checklist what the code can't know: repository secrets or host settings the stack notes need, and anything else this setup couldn't finish. Add `--settings-verified` only when `repo-settings` printed `OK` (it then drops the repo clicks); otherwise the report opens with "SETUP NOT COMPLETE" and carries them.
    - Before the bootstrap is merged, only app-studio's skills load and the app's hooks don't run yet. That is expected, not something to fix.
    - In a session, give the App Creator the same parts for the Project the app will use.
13. **Harness ideas.** If anything in the harness got in the way during setup, send it with `harness-idea`; don't fix `app-studio` from here.
14. **Tell the App Creator** the app link, the backlog's first Ready items, and the test script for v0.1.0.
