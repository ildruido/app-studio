# Sections 3 and 4: how ideas come in, and triage

_On-demand reference, part of [GOVERNANCE](../GOVERNANCE.md). Read it when you file, triage or close an idea._


There is one queue: **GitHub issues on app-studio**.

| Label | Meaning |
| --- | --- |
| `harness-idea` | An idea sent from an app's Project with the `harness-idea` skill: what happened, which harness file, a suggested change. Not yet triaged. |
| `studio-backlog` | Accepted work for app-studio, from triage or created directly in the app-studio Project. |

Ideas from the App-Studio Owner in conversation become an issue first (a `studio-backlog` issue, written by Claude), so nothing lives only in a chat.

- **Filing:** apps file ideas with the `harness-idea` skill, which uses the `Harness idea` issue template (`.github/ISSUE_TEMPLATE/harness-idea.yml`): the label, the title prefix `[harness-idea]`, the App name and the Harness version. The skill's duplicate check also looks at unlabelled issues by title prefix and area name.
- **One label rule for lessons from live checks and migrations:** they come from an app Project (studio-scratch included), so they are filed as `harness-idea` like any other idea and triaged the same way. Issues the studio Project writes itself (from the App-Studio Owner or from its own analysis) are `studio-backlog` from the start.

## 4. Triage

When the App-Studio Owner asks, or at the start of a batch of work, the coordinator goes through every open `harness-idea` issue:

- **Accept:** relabel it `studio-backlog`, and add a line on why and on what it depends.
- **Merge:** if another issue covers it, comment there with the new evidence and close this one as a duplicate.
- **Decline:** close it with a one-line reason the reporting app can understand.

**The trail.** Closing an idea always leaves exactly one comment: the release and the PR that fixed it (for example "Fixed in 0.22.1 (PR #130)"), or the decline reason, or the issue it duplicates. An idea that is accepted is relabelled `studio-backlog` at that moment, not when it closes. The comment names the release because the reporting app learns of it at its next `harness-sync`, which lists the app's own fixed and declined ideas.

Claude recommends; the App-Studio Owner decides anything that changes how they work or what apps do. The order of work is the order the App-Studio Owner gives; without one, issues that hurt every app's daily use come first, then safety, then new capability.
