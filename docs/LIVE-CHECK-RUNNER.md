# Live-check runner

How a live check runs without anyone pasting prompts between Projects. All logic is in `scripts/live-check.mjs` (tests: `scripts/live-check.test.mjs`); Claude only acts out each scenario prompt and does the platform actions. Scenarios are in `releases/scenarios.json`; a release's record names the ones it needs.

**Mailbox** (draft PRs in `studio-scratch`, never merged or closed): **#71 = requests**, **#72 = results**. A message is a PR review with event COMMENT (plain comments don't wake a session). One session per PR receives events.

## Build thread (app-studio) asks for a check
0. Open the PR as a draft and subscribe to it. If it is queued behind another app-facing PR it gets a `QUEUE-WAIT` comment: do not request a check yet. When the `QUEUE-TURN` comment arrives, update the branch from `main`, then continue (merge queue, GOVERNANCE section 9).
1. `node scripts/live-check.mjs request --branch <branch> --commit <sha> --version <release>` (or `--scenarios a,b`; add `--where main` after the merge) prints the request. For a branch run it includes `fp:`, the fingerprint of the PR's app-facing changes (`node scripts/branch-gate.mjs fingerprint`); the runner's result echoes it, and CI's branch gate (GOVERNANCE section 9) accepts only a passing result with the PR's current fingerprint. Open the PR as a draft, and mark it ready once the result passed.
2. Post it as a review (COMMENT) on studio-scratch #71, and `subscribe_pr_activity` to studio-scratch #72 plus a `send_later` check-in 60 minutes out.
3. When a review arrives on #72, save its text and run `node scripts/live-check.mjs read-result --id <id> --file <file>`: exit 0 passed, 1 failed (read the text), 2 not this run's. No result by the check-in: the check failed (never started or timed out); say so.

## Runner thread (studio-scratch) does a check
1. `node <app-studio checkout>/scripts/live-check.mjs prepare --request <file> --app <this app>`: takes the one-run lock (busy: answer with `result --failed "runner busy"`), moves the app-studio checkout to the commit, resets the app, syncs it, and lists each scenario prompt.
2. Act out each prompt (a fresh thread where it says so), saving each final text to `<dir>/<scenario id>.txt`.
3. Read the raw GitHub state a scenario's pass rules name (PR state, checks, files) into a `facts` file, then `judge --request <file> --outputs <dir> [--facts <file>] [--app <this app>]`.
4. `result --request <file> --verdicts <file>` (or `--failed <reason>`) prints the result; post it as a review (COMMENT) on #72. It frees the lock.

## Start prompt (the Admin pastes it once into a new studio-scratch thread; again only if the runner thread ends)
> You are the live-check runner for app-studio. Subscribe to pull request 71 in this repo (`subscribe_pr_activity`) and do nothing else until a review arrives on it. Each review whose text contains `LIVE-CHECK-REQUEST` is a request: save the review text to a file and follow `docs/LIVE-CHECK-RUNNER.md` ("Runner thread") in the app-studio checkout, run from this app. Post the result as a review with event COMMENT on pull request 72. Never merge or close pull requests 71 or 72, never change app-studio, and never answer anything that is not a request.

## CI reads the result
CI's `gate` job reads reviews and comments on studio-scratch #72 with a read-only token (repo secret `LIVE_CHECK_TOKEN` on app-studio: a fine-grained token, only the `studio-scratch` repo, permission Pull requests: read). It looks for a `LIVE-CHECK-RESULT` with `verdict: pass`, the PR's `fp`, and every scenario in the record's `checks.branch` as PASS.
