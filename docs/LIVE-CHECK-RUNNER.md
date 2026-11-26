# Live-check runner

How a live check runs without anyone pasting prompts between Projects. All logic is in `scripts/live-check.mjs` (tests: `scripts/live-check.test.mjs`); Claude only acts out each scenario prompt and does the platform actions. Scenarios are in `releases/scenarios.json`: `kind: "script"` ones (fixed commands, judged only on what they printed or left behind) run in code inside `prepare`; the default `kind: "thread"` ones need Claude's own behaviour or a real thread, and the runner acts those out; a release's record names the ones it needs.

**Mailbox** (draft PRs in `studio-scratch`, never merged or closed): **#71 = requests**, **#72 = results**. A message is a PR review with event COMMENT (plain comments don't wake a session). One session per PR receives events.

## Build thread (app-studio) asks for a check
`node scripts/finish.mjs next` does every step by code (GOVERNANCE section 5): it waits for the merge queue's `QUEUE-TURN`, updates the branch from `main`, makes the request with `live-check.mjs request` (with `fp:`, the fingerprint of the PR's app-facing changes, which CI's branch gate matches), and prints the calls to make: the review (COMMENT) on studio-scratch #71 and a 60-minute check-in. The thread never carries a result: the `merge-queue` workflow runs `scripts/live-check-relay.mjs` (when `main` moves; a missed relay is covered by the thread reading #72 itself at each check-in), reads #71 and #72 with the read-only token, and comments each new result on its PR as `<!-- live-check-result:<id>:<pass|fail> -->` plus the result text (a branch run goes to the open PR on the request's branch, a main run to the PR the release record names). That comment wakes the thread; and on every check-in `finish next` also tells the thread to read #72 itself (the newest review with the run's id, saved to `.git/finish-live.txt`, passed as `--live-result`), so a missed relay costs one check-in, never a stall. `finish next` reads only the marker from the facts or that result: a pass marks the PR ready, a fail is handed back, no result by the check-in counts as failed. After the merge, for a loader or setup release or a record that names main scenarios, it does the same for a `main` check and opens the `pass-main` PR.

## Runner thread (studio-scratch) does a check
Save the request review's text to a file, pick a new empty outputs directory, then run this until it says DONE and do exactly what each answer prints:

`node <app-studio checkout>/scripts/live-check.mjs next --request <file> --outputs <dir> --app <this app> --repo <owner/name of this app>`

`next` reads the run's state (the one-run lock and the files in `<dir>`) and prints one action:
- **run `prepare`** (its last step marks the run as prepared; it takes the one-run lock, moves the app-studio checkout to the commit, resets and syncs the app, runs every `kind: "script"` scenario itself and captures it by code). If another run holds the lock it prints instead the `runner busy` result to post on #72, and never frees the other run's lock. If `prepare` itself fails (stale request, unknown scenario), it says to post the failure as a result.
- **act out scenario X** (one at a time, its prompt included): run every scripted command through `live-check.mjs exec --outputs <dir> --scenario <id> --step <name> -- <command...>` (code saves its exit code, stdout and stderr; the `exec` and `exec-absent` pass rules read only those files, never your summary) and save the final text to `<dir>/<id>.txt`. Your `RESULT <id>: PASS|FAIL` line is only a cross-check: if it disagrees with the code's verdict, the run fails with "disagreement". A scenario marked `model-behaviour` tests what Claude says or sees, so its text is the evidence. A skipped scenario is impossible: `next` keeps printing it until its file exists. The runner cannot open a fresh thread, so no scenario may need one.
- **read the facts** (only when a scenario has `pr-state`, `check` or `file` rules): `live-check.mjs facts` reads them by code with a GitHub token (`GH_TOKEN` or `GITHUB_TOKEN`). Without a token it exits 3: paste the raw GitHub API response into the facts file, never a summary.
- **judge**, then **result** (both written to files by code; `result` frees the lock).
- **post** the result text as a review (event COMMENT) on #72, then run `next --posted`. Then `next` says DONE: stop and wait for the next request.

`next` refuses an outputs directory that belongs to another run.

## Start prompt (the Admin pastes it once into a new studio-scratch thread; again only if the runner thread ends)
> You are the live-check runner for app-studio. Subscribe to pull request 71 in this repo (`subscribe_pr_activity`) and do nothing else until a review arrives on it. Each review whose text contains `LIVE-CHECK-REQUEST` is a request: save the review text to a file and follow `docs/LIVE-CHECK-RUNNER.md` ("Runner thread") in the app-studio checkout, run from this app. Post the result as a review with event COMMENT on pull request 72. Never merge or close pull requests 71 or 72, never change app-studio, and never answer anything that is not a request.

## CI reads the result
Two CI jobs read #72 with the same token: the relay above (comments the result on its PR) and the merge gate below (judges the merge).
CI's `gate` job reads reviews and comments on studio-scratch #72 with a read-only token (repo secret `LIVE_CHECK_TOKEN` on app-studio: a fine-grained token, only the `studio-scratch` repo, permission Pull requests: read). It looks for a `LIVE-CHECK-RESULT` with `verdict: pass`, the PR's `fp`, and every scenario in the record's `checks.branch` as PASS.

## One-time manual check: helper agents run on the model they declare (#250)
The runner can't load new agent definitions mid-thread, so this one is run by hand, once, after the release (the branch scenario `subagent-model-logged` only proves the log line works). Open a **fresh** studio-scratch thread after the release is on `main`, and send:
> Run `harness-sync`, then start the `qa` helper agent with the task "Reply with the word ready and use no tools", and wait for it to finish. Then run `tail -n 8 /tmp/studio-hooks.log` and show me the output.

Pass: the log shows a line `subagent qa model=claude-sonnet-… effort=medium`, while the thread itself runs on another model (Opus). Fail: `model=unknown` (the log step can't read the transcript) or an `opus` model on that line (the pin was ignored); hand back the log lines. Skills stay `model: inherit` until this passes; a later change then pins them and checks the same way.
