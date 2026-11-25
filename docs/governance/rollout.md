# Section 6: how changes reach apps

_On-demand reference, part of [GOVERNANCE](../GOVERNANCE.md). Read it when you change the loader, the setup script or what apps get._


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
