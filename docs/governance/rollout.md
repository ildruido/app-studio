# Section 6: how changes reach apps

_On-demand reference, part of [GOVERNANCE](../GOVERNANCE.md). Read it when you change the loader, the setup script or what apps get._


| What | Where apps get it | When |
| --- | --- | --- |
| **The loader**: `scripts/studio-env.mjs`, run by the "app-studio apps" environment's launcher at every thread start and hook | app-studio's `main`, directly | the next thread in any app's Project |
| **The harness content**: skills, agents, hook scripts, templates, stack pack docs | the app's own pinned copy (`.claude/studio/lock.json`) | only when that app runs `harness-sync`, and only up to the newest release: a change merged since then waits for the next release cut |
| **Pack starter files**: CI workflows, configs, server code | copied once into a new app; the app owns them | new apps; existing apps only by an **App action** |
| **The environment's setup script**: `scripts/env-setup.sh` | pasted into the "app-studio apps" environment by the Admin | only after an **Admin action** |

Rules that follow from this:

- **Loader changes are branch-tested like other app changes** (#227): the launcher runs `scripts/studio-env.mjs` from the app-studio checkout at every hook, so a studio-scratch thread whose checkout is on the PR's commit runs the branch loader from its next hook on, and each hook logs `loader <version of that checkout>` in `/tmp/studio-hooks.log`. Only the thread's first start-up (SessionStart) and `scripts/env-setup.sh` stay `main`-only. A loader release therefore names a branch scenario (`loader-follows-checkout`) and a `main` one. If a live check ever shows that a moved checkout does not run its own loader, the fallback is a `loader-stable` tag that apps read, moved only after the `main` check passes; that needs one Admin paste of the setup script.
- **The loader must keep working with every app copy from 0.6.0 on.** It reaches all apps at once, with no sync step to stop it. A test in `scripts/studio-sync.test.mjs` ("the current loader works with an app copy as old as 0.6.0") guards this; when the loader starts to need something an old copy lacks, the change must handle the missing piece, not drop the old copy.
- **Avoid changing `scripts/env-setup.sh`**: each change needs the Admin to paste it again. Put logic in `scripts/studio-env.mjs` instead.
- **Rolling out to apps:** an app pulls a release with `harness-sync` part A, in a thread of its own Project, when the App Creator asks. Give the App-Studio Owner one line per app to paste into that app's coordinator. For changes with App actions or risk, migrate **one app at a time**, with a written plan and a way back, and verify with one small PR that merges by itself before moving to the next.

## The loader canary (#366)

The loader works around a platform limit (cloud threads don't run hooks from a repo's `.claude/settings.json`), so one platform change could switch every app's guards off silently. A scheduled task, **"Loader canary"** (daily, 03:14 UTC, a fresh thread of the app-studio Project; mechanism: Claude Code scheduled tasks, no extra service), proves by code that a fresh thread still loads the harness: `node scripts/canary.mjs prepare`, the thread does what it prints, then `node scripts/canary.mjs judge`. The judge reads raw text and the hook log, never the thread's summary; the two log lines are the evidence the thread cannot write:

- the start-up message the thread saw begins `Studio harness loaded`;
- `/tmp/studio-hooks.log` shows a `loader <version>` line and a `commit` hook run after the check started (the launcher's hooks run);
- the thread's attempt to merge an app-studio PR is refused with the merge gate's message, and the log shows `merge exit=2`. For this the check builds a throwaway app (`canary-app`) beside the checkout, so the app's gate is live; the thread never merges anything.

A pass is silent. A failure opens (or comments on) one issue titled `[canary] ...` on app-studio, label `harness-idea`.

**When it fails:** read the issue's reasons. No start-up message or no hook lines means the launcher or the user-settings wiring no longer runs in new threads: check `/tmp/studio-env.log` in a fresh thread and the environment's setup script, and tell the App-Studio Owner before any app is told anything. A merge that was not refused means the app's gate is off or changed: stop merges from app threads until it is fixed. A run that did not happen (no issue, no pass) shows in the scheduled task's last run; treat three missed days in a row as a failure.

**The opposite case (weekly, for the day the loader is no longer needed):** `node scripts/canary.mjs native --skills <file>` in a thread of an environment without the launcher (the Default environment): the thread saves the names of its available skills, and the check exits 1 when it lists a skill the repo ships in its own `.claude/skills/`. That means the platform loads a repo's skills by itself: file an issue to plan removing the loader and `scripts/env-setup.sh`. The check is built; the weekly schedule needs a studio-scratch Project thread in that environment and is not set up yet.

**Limits:** the daily thread runs in the app-studio Project (same environment script as the apps' environment, same launcher), not in an app Project, and only the studio-side of the loader is visible there; the throwaway app stands in for an app.
