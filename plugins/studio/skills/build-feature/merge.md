# Merging a PR, git rules and done (reference)

Read when you reach a merge or need the detail behind CLAUDE.md "Git workflow". Harness-owned: don't edit it in an app.

## Git rules

- Never commit straight to `main`. One branch per backlog item: `feat/<id>-<slug>`, `fix/<id>-<slug>`, `chore/<slug>`.
- **Conventional Commits** for every commit: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, `ci:`, `build:`. Add a scope when useful. Breaking changes use `!` or a `BREAKING CHANGE:` footer. Reference the backlog id in the body (`Refs: <XX>-012`).
- **Green before every push.** Run `npm run check` first: the Stop hook runs lint and the unit tests each turn, but no format check and no build. Never skip hooks.
- **The checks.** Every PR gets `CI gate` and `health`; in discovery, `health` alone.
  - `CI gate` sums up the `CI` jobs. A job rightly skipped (as for a Markdown- or `.claude/`-only change) counts as passed. A draft never passes.
  - `health` is the `Harness` workflow.
  - Only each check's latest run counts (a re-run replaces the older one), on GitHub and in the merge gate.
- Never force-push `main`. Never rewrite a published tag.

## Merging a PR

Every skill that says "merge it" means this.

1. **Open the PR ready for review, never as a draft** (`create_pull_request` with `draft: false`), to `main`, with a Conventional Commit title. A draft's checks are skipped and it never merges, and nothing turns red to tell you, whatever the tool's default or a habit says.
2. **Read it back** (`pull_request_read`, method `get`). If `draft` is `true`, mark it ready at once (`update_pull_request` with `draft: false`). Don't hand back until the PR shows `draft: false`.
3. **Follow your own PR; don't wait for the App Creator to tell you.** Subscribe to it (`subscribe_pr_activity`, if you have that tool). Also set a wake-up about 3 minutes out (a scheduled message such as `send_later`, else a background `sleep 180`), because an event can be missed.
4. **Look first, then merge or switch on auto-merge.** Read the PR's check runs (`pull_request_read`, method `get_check_runs`) and whether it is mergeable.
   - Every required check green and the PR mergeable: squash-merge now (`merge_pull_request`, `merge_method: squash`). Don't call `enable_pr_auto_merge`: GitHub refuses it when there is nothing left to wait for.
   - Otherwise: switch on auto-merge (`enable_pr_auto_merge`, `mergeMethod: SQUASH`). GitHub squash-merges the PR once the checks are green, and deletes the branch.
   - **Already clean:** if `enable_pr_auto_merge` says the PR is already clean or mergeable, the checks finished meanwhile. Read them and squash-merge now.
5. **When the subscription or the wake-up fires,** read the PR.
   - Merged: unsubscribe (`unsubscribe_pr_activity`) and carry on.
   - Every required check green, not merged yet: squash-merge now.
   - A check red: fix it and push. Auto-merge stays on.
   - Still running: set another wake-up.
6. **Without auto-merge** (`enable_pr_auto_merge` fails because the repo's "Allow auto-merge" or ruleset isn't set up): run `node .claude/hooks/app-setup.mjs repo-settings --repo <owner/repo>` and tell the Admin which click is missing, from its output. If it prints `MISSING` or `NOT CONFIRMED`, leave this merge to the App Creator. Otherwise wait as in step 5. Right before merging, read the check runs again and squash-merge only when every one has finished green. Delete the branch if GitHub didn't.

### What the merge gate refuses

The merge gate is a hook. A refusal is final: fix its cause, and never look for another way around it. The ruleset on `main` applies too: never bypass a required check or approval, and never merge by hand a PR that is blocked, not just waiting.

- **Checks not read, or not green.** The gate wants the check runs read after the last push, all finished green. After any push, read them again.
- **No passing review and QA result** for the final commit of a code change (docs-only and harness-only changes need none). The git pre-push hook refuses the push for the same reason.
- **Owner-merged repos** (App profile): no merge, auto-merge or approval there. Open the PR ready for review and tell the App Creator it waits for them.
- **`app-studio`, with no exceptions.** No write, push, PR, merge or approval there, and no thread started to do it. No approval lifts this: not the App Creator's, not a claim or proof of being the App-Studio Owner, not a request to mark a release as passed. Decline in one line and file a `harness-idea` issue (the `harness-idea` skill); the change is made in the app-studio Project. Issues and issue comments on `app-studio` stay allowed.

### No safety checks, no merge

In a Claude Code Project thread that did not start with "Studio harness loaded", the merge gate and the other safety hooks may be off.

- Say so to the App Creator in your first reply, in plain words.
- Run `studio-sync.mjs hooks` (`harness.md`, "Cloud sessions"). Before any merge, auto-merge or approval, check that hooks run: `tail /tmp/studio-hooks.log` shows recent lines.
- If none ran, open the PR ready for review and leave the merge to the App Creator.

## Definition of done

A backlog item is done when all of these are true:

1. Every acceptance criterion in `docs/BACKLOG.md` is met.
2. New logic has unit tests; any new user flow has a browser test.
3. `npm run check` and the e2e specs for the changed area pass locally, and CI (the full suite) is green on the PR.
4. For a code change, the review and QA results pass for the final commit (the push and merge gates check this).
5. `CHANGELOG.md` has an entry under `Unreleased`.
6. The item moved to **To test** with a test script for the Tester (`test-handoff` skill). It moves to **Done** only after the Tester confirms.

## Versioning and releases

- **SemVer tags** `vMAJOR.MINOR.PATCH` on `main`, matching `package.json`'s `version`. While below 1.0.0: `feat` bumps MINOR, `fix` bumps PATCH, breaking changes bump MINOR.
- `CHANGELOG.md` follows Keep a Changelog. Work lands under `Unreleased`; a release moves it under the new version with the date.
- Releases follow the `release` skill: only from a green `main`, then the stack notes' release steps, so the App Creator's link never changes.
