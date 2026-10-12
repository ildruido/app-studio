---
name: workflow-report
description: Weekly one-screen workflow report from GitHub: per backlog item lead time, CI minutes, pushes per PR and bugs found in tests. Use for the Monday report or when asked how fast and cheap the workflow is.
---

# Workflow report

Numbers per finished backlog item, from pull requests and Actions runs (no session data):

| Number | Meaning |
|---|---|
| Lead time (h) | first commit of the first work PR (`feat`, `fix`, `refactor`, `perf`) to the last one merged. Proxy for In progress to To test |
| CI min | billed minutes (each job rounded up) of runs on the item's PR branches while open, plus the push run on the merge commit |
| Pushes/PR | commits per work PR (the rule is one push per feature) |
| Bugs found | bug items whose `Found in:` line names the item (older items: "found ... in the XX-0NN test") |

Items are grouped by the first `<XX>-0NN` id in the PR title (then body, then branch).

## Run

```
python3 -I scripts/workflow_metrics.py --repo OWNER/NAME --prefix XX --since <date 5 weeks back> \
  --backlog docs/BACKLOG.md --backlog docs/BACKLOG-DONE.md \
  --csv <SHARED>/usage/workflow.csv --report <OUT>/workflow-report.md --project "<name>"
```

Use `--since auto --backlog-remote docs/BACKLOG.md --backlog-remote docs/BACKLOG-DONE.md` for the weekly run: no clone needed, only the last week is fetched. `workflow.csv` is upserted by item id, so reruns are safe. Post `workflow-report.md` as the reply, and link the usage dashboard if there is one. Takes a few minutes on a first run (one call per CI run); later runs use a short `--since`.

## Reading it

Lead time or pushes per PR rising over weeks means items are getting bigger or reviews are finding more: split items. Bugs above zero on an item means its test script missed something. CI minutes are the free-tier budget.
