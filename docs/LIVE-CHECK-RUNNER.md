# Live-check runner

How a live check runs without anyone pasting prompts between Projects. All logic is in `scripts/live-check.mjs` (tests: `scripts/live-check.test.mjs`); Claude only acts out each scenario prompt and does the platform actions. Scenarios are in `releases/scenarios.json`; a release's record names the ones it needs.

**Mailbox** (draft PRs in `studio-scratch`, never merged or closed): **#71 = requests**, **#72 = results**. A message is a PR review with event COMMENT (plain comments don't wake a session). One session per PR receives events.

## Build thread (app-studio) asks for a check
`node scripts/finish.mjs next` does every step by code (GOVERNANCE section 5): it waits for the merge queue's `QUEUE-TURN`, updates the branch from `main`, makes the request with `live-check.mjs request` (with `fp:`, the fingerprint of the PR's app-facing changes, which CI's branch gate matches), and prints the calls to make: the review (COMMENT) on studio-scratch #71, `subscribe_pr_activity` to #72 and a 60-minute check-in. When a review arrives on #72, the thread saves its text and runs `next --result <file>`: a pass marks the PR ready, a fail is handed back, no result by the check-in counts as failed. After the merge it does the same for a `main` check and opens the `pass-main` PR.

## Runner thread (studio-scratch) does a check
1. (If `prepare` says "unknown scenario" because the checkout is behind, first run `git -C <app-studio checkout> fetch origin <branch> && git -C <app-studio checkout> checkout --detach <commit>` and run it again: a new scenario exists only in the commit under test. Since 0.39.5 `prepare` moves the checkout before it reads the catalog.)
1. `node <app-studio checkout>/scripts/live-check.mjs prepare --request <file> --app <this app>`: takes the one-run lock (busy: answer with `result --failed "runner busy"`), moves the app-studio checkout to the commit, resets the app, syncs it, and lists each scenario prompt.
2. Act out each prompt in this thread (or a helper agent; the runner cannot open a fresh thread, so no scenario may need one), saving each final text to `<dir>/<scenario id>.txt`.
3. Read the raw GitHub state a scenario's pass rules name (PR state, checks, files) into a `facts` file, then `judge --request <file> --outputs <dir> [--facts <file>] [--app <this app>]`.
4. `result --request <file> --verdicts <file>` (or `--failed <reason>`) prints the result; post it as a review (COMMENT) on #72. It frees the lock.

## Start prompt (the Admin pastes it once into a new studio-scratch thread; again only if the runner thread ends)
> You are the live-check runner for app-studio. Subscribe to pull request 71 in this repo (`subscribe_pr_activity`) and do nothing else until a review arrives on it. Each review whose text contains `LIVE-CHECK-REQUEST` is a request: save the review text to a file and follow `docs/LIVE-CHECK-RUNNER.md` ("Runner thread") in the app-studio checkout, run from this app. Post the result as a review with event COMMENT on pull request 72. Never merge or close pull requests 71 or 72, never change app-studio, and never answer anything that is not a request.

## CI reads the result
CI's `gate` job reads reviews and comments on studio-scratch #72 with a read-only token (repo secret `LIVE_CHECK_TOKEN` on app-studio: a fine-grained token, only the `studio-scratch` repo, permission Pull requests: read). It looks for a `LIVE-CHECK-RESULT` with `verdict: pass`, the PR's `fp`, and every scenario in the record's `checks.branch` as PASS.
