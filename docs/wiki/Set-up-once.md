# Set up once

Done once by the **Admin**; after that, every new app reuses it.

## 1. The "app-studio apps" cloud environment

Threads in a Project start in the folder above the repositories, so they would load none of the app's skills, agents or hooks. The environment's setup script fixes that.

1. claude.ai → Claude Code → Settings → Environments → new environment named **app-studio apps**.
2. Setup script: paste the whole of `scripts/env-setup.sh` from the repository. Network: allow package registries, plus any host the app's stack needs.
3. Check: every thread on it starts with "Studio harness loaded …". The log is `/tmp/studio-env.log`.

The script installs only a small launcher. At each thread start the launcher runs the current loader (`scripts/studio-env.mjs`) from app-studio, so updates reach threads by themselves. Paste the script again only when a changelog entry says **Admin action** for it.

## 2. A Project per app

Create a Claude Code Project, attach `app-studio` and the app's repository, and select the **app-studio apps** environment. The app-studio Project itself uses the **Default** environment instead (otherwise it would load the harness as if it were an app).

## 3. Repository settings for each app

Claude can't change repository settings, so the Admin clicks them once per app. `new-app` hands over the exact steps:

- Settings → General → Pull Requests: only **Allow squash merging**, plus **Allow auto-merge** and **Automatically delete head branches**.
- Settings → Rules → Rulesets: a ruleset on the default branch that blocks deletions and force pushes and requires the checks `CI gate` and `health`.
- Default branch is `main`.

Until those are done, Claude merges a green PR directly instead of using auto-merge.

## Things Claude can't do for you

- Delete branches of closed, unmerged PRs (the Admin's "Delete branch" click).
- Change repository settings or secrets.
- Edit the Project's "What do you want to work on?" box. Claude proposes the text; it is pasted once.
