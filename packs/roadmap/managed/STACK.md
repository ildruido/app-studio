# Roadmap module: a Roadmap list kept honest by a check

A process module (`"kind": "module"` in `pack.json`): added only when the owner wants a prioritised Roadmap list (`pack add roadmap`). An app without it has no Roadmap list, no roadmap script and no roadmap test, and its CI never asks for one. It needs `base`.

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
