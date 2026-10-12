---
name: usage-snapshot
description: Record token and cost counters for every session in a Claude project into usage/snapshots.csv, reading only sessions that changed since their last snapshot.
---

# Usage snapshot

Follow `ROUTINE_PROMPT.md` in the plugin root exactly. Rules:
- Counters are cumulative per session; never edit old rows, only append.
- Read a session in full only when its last activity is later than its newest row.
- One parallel batch of reads, no summaries, no dashboard.
- Use a cheap model (Haiku class) for the runner thread: the job is mechanical.
- To set up in a new project: create a small dedicated thread, then create a daily routine pointing at it with the prompt from `ROUTINE_PROMPT.md` (replace <SHARED> with the project's shared files folder). Routines in private projects cannot start a fresh session, so the dedicated thread is the runner.
