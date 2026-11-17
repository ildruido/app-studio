# Everyday workflow

## The loop

1. **You tell the coordinator what you want**, in plain words or by pointing to a spec. The coordinator never builds; it plans and starts threads.
2. **`prd-intake`** turns it into PRD changes and backlog items with acceptance criteria. It asks only product questions, one at a time, each with a recommended answer. Decisions are recorded in the app's decision log.
3. **You order the backlog** (or the Roadmap list, when the app has it). The coordinator keeps priorities; one thread builds one item.
4. **`build-feature`** builds the top Ready item: branch, plan, code, tests, review by the `reviewer` agent, a PR, and a merge when checks pass ([How PRs merge](How-PRs-merge)).
5. **`test-handoff`** writes a short numbered test script for the **Tester**, with an expected result for each step. The item sits in **To test** until the Tester confirms; then it is **Done**. A bug found in testing gets a new thread, never a revived old one.
6. **`release`** cuts a versioned release from a green `main`, updates the changelog and ships to the app's release target, so your link never changes.

## Definition of done

Every acceptance criterion met; tests for new logic and flows; checks green on the PR; the reviewer's blocking findings fixed; a changelog entry; a test script written.

## Rules threads follow

- A thread stays inside its backlog item. When done or blocked it hands back and stops; only the coordinator picks the next item.
- One thread per item. A thread idle for over an hour is never resumed; a new one reads the item and its PR.
- Models: Opus for the coordinator and risky reviews, Sonnet at medium effort for threads. Effort or model is raised only after a thread fails twice.
- Replies to you are plain English: what changed for the user first, then how to check it; what was not verified is said plainly.

## What stops the loop

Safety hooks block the work, by design: a failing lint, test or health check; a merge with unread or red checks; blank safety fields in the App profile (access model, AI public use) at release time. Fix the cause; nothing is bypassed.
