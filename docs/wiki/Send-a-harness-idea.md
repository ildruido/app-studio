# Send a harness idea

While working on an app you may find the harness could do better: a skill step that got in the way, a wrong rule, a missing check. Apps never fix app-studio; they send an idea.

## Sending

Ask the coordinator to use the `harness-idea` skill, or say "send this as a harness idea". It opens a GitHub issue on app-studio from the **Harness idea** template: the label `harness-idea`, the title prefix `[harness-idea]`, the app's name and harness version, what happened, which harness file, and a suggested change. It checks for duplicates first, including unlabelled issues.

Lessons from live checks and migrations are filed the same way.

## What happens next

The coordinator in the app-studio Project triages every open `harness-idea`:

- **Accept**: relabelled `studio-backlog` at once, with a line on why and what it depends on.
- **Merge**: closed as a duplicate, with the new evidence added to the other issue.
- **Decline**: closed with a one-line reason the reporting app can understand.

Closing always leaves exactly one comment: the release and PR that fixed it, the decline reason, or the duplicate. The reporting app hears about it at its next sync, which lists its own fixed and declined ideas.

The App-Studio Owner decides anything that changes how people work or what apps do. Without an order, issues that hurt every app's daily use come first, then safety, then new capability.
