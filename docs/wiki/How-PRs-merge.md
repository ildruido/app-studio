# How PRs merge

## In an app

PRs are opened **ready for review**, never as drafts (a draft's checks are skipped and it never merges). Right after opening, the thread reads the PR: if the required checks (`CI gate` and `health`) are already green and it is mergeable, it squash-merges at once; otherwise it switches on auto-merge and GitHub merges when they turn green. The thread follows its own PR, fixes red checks and confirms the merge before handing back. It never merges around a required check.

## In app-studio itself: risk tiers

CI sets each PR's tier from the files it changes, using the scripts as they are on `main`, so a PR can't lower its own tier. A thread may raise a tier with the label `tier:owner`, never lower it.

| Tier | What lands here | Who merges |
| --- | --- | --- |
| **owner** | the loader, the setup script, CI and the tier rules, unknown files, rule files (unless the change is a wording-only edit), a lost test, a changelog **App action** or **Admin action**, more than about 400 changed lines | Only after the **App-Studio Owner's OK** in the thread. The thread then adds the label `owner-ok`. Updating the branch because `main` moved keeps the OK; a change to the PR's own changes removes the label, so the OK must be given again. |
| **live check before apps** | what apps get: skills, agents, hooks, templates, packs, the sync tool | Automatically when `check` is green. The changelog entry says `Live check: pending`, so apps can't pull it until the live check passes. |
| **auto** | other docs, added tests, the changelog | Automatically when `check` is green. |

## The safety net

- `check` also runs the tests, the generic-core lint, the packs smoke test (when a pack or sync changes) and a release check: changed harness files need a higher plugin version and a changelog entry.
- CI runs from `main`, not from the PR, so a PR can't change how it is judged. Any change under `.github/` is the owner tier.
- The owner-OK label is a tripwire against mistakes, not a lock (GitHub offers no required reviewers for this private repo).
- Off switch: the repository variable `ALL_NEED_OWNER` = `true` sends every PR to the owner tier.

## Live check

A change apps experience (loader, bootstrap, merge flow, app template wording) is tried in **studio-scratch**, a disposable app Project, before it is called done. After it passes, a small PR changes `Live check: pending` to `Live check: passed <date>` and apps may pull the release. Changes to app-studio's own rules get no studio-scratch check, because it never sees them.
