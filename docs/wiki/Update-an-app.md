# Update an app

## Two kinds of update

| What | Reaches the app | When |
| --- | --- | --- |
| **The loader** (links skills, runs hooks at thread start) | straight from app-studio's `main` | the next thread, automatically |
| **Harness content** (skills, agents, hook scripts, templates, pack docs) | the app's pinned copy | only when the app runs `harness-sync` |

So a thread runs the latest loader over the app's pinned content. The pin is deliberate: an app updates on purpose, and its own CI needs its copy. The loader keeps working with every app copy from 0.6.0 on.

## Pulling an update

When a session warns the harness is behind, or when you ask, the coordinator starts a thread that runs `harness-sync` (part A):

1. Checks what is behind, locally edited or missing.
2. Pulls the new version. It refuses a release marked `Live check: pending` and changes nothing.
3. Reads the changelog for skipped versions and applies every step marked **App action**.
4. Reports which of the app's own ideas were fixed, in which release.
5. Runs the health check and merges a `chore(harness): sync` PR.

## What a sync leaves alone

- **Starter files** from packs (CI workflow, configs, server code) are the app's own code. If app-studio improves one, the thread tells you and merges it by hand.
- **App text** in `CLAUDE.md`. Only the harness-owned sections between `studio:begin` and `studio:end` markers (the merge rule and the first Roles bullets) are replaced.
- **Project instructions** live in Project settings, so no sync can update them. When their template changes, the sync gives the coordinator a ready prompt to compare and update its own instructions, keeping app-specific content, and a reminder repeats until it is acknowledged.

## Older apps

An app set up by hand or before modules existed is not a plain sync: `migrate-app` plans the move with your OK, one app at a time, with no change for its users.

## Adding a pack later

`pack add <name>` adds a stack pack or module to an existing app, for example `web` once an artifact prototype is ready to become a website. See [Packs and modules](Packs-and-modules).
