# Concepts and roles

## The idea in one minute

- **app-studio** (this repository) holds the shared way of working: skills (checklists Claude follows), agents (reviewers and testers), hooks (automatic checks), templates and stack packs.
- Each **app** has its own repository and its own Claude Code **Project**. The Project has a **coordinator** (a Claude that talks to you, plans and starts work) and **threads** (one Claude per task: one backlog item, one release, one sync).
- An app carries a **pinned copy** of the harness (`.claude/studio/lock.json`). It changes only when the app runs a sync, on purpose.
- Apps never change app-studio. They send ideas back as GitHub issues (see [Send a harness idea](Send-a-harness-idea)).

## Roles

| Role | Who | What they do |
| --- | --- | --- |
| **App-Studio Owner** | Owns the harness | Decides what changes in app-studio and when it ships; approves risky changes (the owner tier, see [How PRs merge](How-PRs-merge)). Judges by how the workflow behaves, not by reading code. |
| **App Creator** | Owns one app | Describes requirements, orders the backlog, answers product questions. Neither writes code nor manages git. |
| **Tester** | Often the App Creator | Tests each release with the script Claude writes and reports results. |
| **Admin** | Whoever has the accounts | Does the few things only a person can: creating a repo, repository settings, secrets, a host's settings, deleting branches. Claude gives exact, copy-ready clicks. |
| **Claude** | The engineer | Owns code, tests, versions, releases and the harness. Asks only product questions, one at a time, each with a recommended answer. |

One person can hold several roles. The roles tell you whose decision something is.

## Two kinds of Project

| | app-studio Project | App Project |
| --- | --- | --- |
| Purpose | Evolve and govern the harness | Build one app with the harness |
| Rules | `docs/GOVERNANCE.md` and `docs/studio-project-instructions.md` | The app's `CLAUDE.md` and Project instructions |
| Changes | app-studio only | the app's repo only |

A change to one's rules does not change the other's.

## Words you will meet

- **Harness**: the shared skills, agents, hooks, templates and packs.
- **App profile**: the table at the top of an app's `CLAUDE.md` (name, stack, access model, AI on or off, and so on). Skills read it instead of assuming anything.
- **Phase**: `discovery` (no stack chosen yet; fields may say `TBD`) or `build`. Only an explicit "start building" switches it.
- **Backlog item**: one independently testable slice, with acceptance criteria the App Creator can check by looking at the app.
- **Pack**: build and CI files for a way of building (stack packs) or a feature (modules). See [Packs and modules](Packs-and-modules).
- **Live check**: trying a harness change in a real throwaway Project (studio-scratch) before apps may take it.
- **Tier**: how risky a change to app-studio is; it decides who merges.
