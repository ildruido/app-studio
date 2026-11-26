# Human docs module: pages written for people, by one skill

A process module (`"kind": "module"` in `pack.json`): added only when the App Creator wants pages for people (user guide, how-tos, README, wiki). An app without it has no such skill and nothing asks for one. It needs no other pack.

## What it adds

| File | What |
| --- | --- |
| `.claude/skills/human-docs/SKILL.md` | The skill: four modes (write, edit, review, optimize) and the reader-first rules. Kept in step by `pull`, like the core's skills |

## Set it up once

The skill knows nothing about the app until it is told. Add one row to the App profile in `CLAUDE.md`, **Human docs**, with: who reads the pages, where they live (folder or site), the words to avoid or always explain, and where the facts come from (the PRD, the backlog, the code). Until the row exists the skill asks for these once and writes them there. It never assumes a wiki exists and never publishes: publishing stays as the app already does it.

## Rules

- The skill changes only pages the App Creator names. Review mode never changes a page.
- Facts come from the app's own docs and code; a claim it cannot find there is flagged, not invented.
- Machine-facing files (code comments, the backlog, changelog, rule files, config) are out of scope.
