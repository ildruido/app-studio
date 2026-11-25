# Roadmap module: a Roadmap list kept honest by a check

A process module (`"kind": "module"` in `pack.json`): added only when the App Creator wants a prioritised Roadmap list (`pack add roadmap`). An app without it has no Roadmap list, no roadmap script and no roadmap test, and its CI never asks for one. It needs `base`.

## What it adds

| File | What |
| --- | --- |
| `scripts/roadmap/roadmap.ts` | Reads `docs/BACKLOG.md`, checks the Roadmap list against the open items, and builds the roadmap page data |
| `scripts/roadmap/cli.ts` | `npm run roadmap:check` (exit 1 on a mismatch, for Markdown-only PRs that start no CI) and `npm run roadmap:data` (prints the page data as JSON) |
| `tests/unit/roadmap.test.ts` | The same check as a unit test, so CI fails on a mismatch |

## Rules

- The roadmap is the **Roadmap** list at the top of `docs/BACKLOG.md`: `## Roadmap` with `- **Now:**`, `- **Next:**`, `- **Later:**` lines of item ids, in priority order.
- Every open item is in the list exactly once; an item leaves the list when it reaches Done. A roadmap page, if the app has one, is rebuilt with `npm run roadmap:data`, never edited by hand.
- The owner and status words the tooling understands are the module's defaults; the app may edit the files, which it owns once copied.

## Who maintains the list

- **The coordinator (the Project chat) owns the App Creator's product decisions:** new ideas, priorities and order. It has the backlog change made in a short thread of its own (no standing roadmap thread, which would be a long-idle thread revived over and over), and that thread places new items in the Roadmap list and rebuilds the roadmap page (with the module).
- **Planning threads** may add App Creator-approved items to the backlog in their own PR (the plan and its items stay together) but, with the module, must place every new open item in the Roadmap list. The coordinator gives a planning thread an ID range up front.
- **Feature threads** keep marking their own items To test and Done (`test-handoff`) and, with the module, move them out of the Roadmap list when they reach Done.
- **A check keeps it honest (with the module):** the unit test `tests/unit/roadmap.test.ts` (and `npm run roadmap:check`, for Markdown-only PRs that start no CI) fails when an open item is missing from the Roadmap list, listed twice, or listed but not open.
