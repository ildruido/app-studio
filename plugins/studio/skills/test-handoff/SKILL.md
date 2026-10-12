---
name: test-handoff
description: Write a short manual test script for Ale, and turn Ale's test results into done items or bug items. Use after a release, or when Ale reports test results.
---

# Test handoff

App-specific facts come from the **App profile** in `CLAUDE.md`; `<XX>` below is its id prefix.

## Part A: write the script

1. Collect the items in **To test** in `docs/BACKLOG.md` and their acceptance criteria. If Ale tests in batches, cover every item still waiting in one combined script.
2. Write at most 7 numbered steps per item, and at most 15 for a combined script, that cover every criterion, in the order a user would do them. Each step has:
   - **Do:** one concrete action in the app, with the exact text to type or button to press.
   - **Expect:** what Ale should see. Concrete and visible, never "it works".
3. Start with how to reach the build under test: the release target (or preview target) link from the App profile, the version Ale should see, and any step the stack notes say must come first (for example a manual deploy).
4. Mention any one-time consent prompt Ale will see, and say whether to allow it.
5. End with: "Reply with the step numbers that failed and what you saw. A screenshot helps."
6. Post the script in chat, or as a file when it is longer than about 15 lines. Write in plain English, no technical terms.

## Part B: process the results

1. For each step Ale reports as passing, tick its criteria. When all criteria of an item pass, move it to **Done** with the release version: add the full item at the top of `docs/BACKLOG-DONE.md` and only its title line under **Done** in `docs/BACKLOG.md`.
2. For each failure, create a bug item at the top of **Ready**:

   ```md
   ### <XX>-0NN Bug: what the user sees
   - Found in: vX.Y.Z (<XX>-0NN, the item that was being tested), step N of the test script
   - Steps to reproduce: …
   - Expected: … / Actual: …
   - Acceptance criteria:
     - [ ] The failing step now shows the expected result
     - [ ] A regression test covers it
   ```

   The item id in `Found in` is how the weekly workflow report counts bugs per item, so always include it.

   Each bug is built in a new thread that reads the original item and its PR.
3. If a report is unclear, ask Ale one specific question instead of guessing.
4. Commit with `docs(backlog): record test results for vX.Y.Z`, merge via PR, and tell Ale what moved to Done and which bugs are next.
