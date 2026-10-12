# session-usage (v0.2.1)

Daily token and cost snapshots for every session in a Claude project, plus an on-demand dashboard. Uses only session records, so no outside account is needed.

## Parts
- `skills/usage-snapshot`: what the daily runner does. Prompt text in `ROUTINE_PROMPT.md`.
- `skills/usage-report`: builds the dashboard and a short summary.
- `scripts/aggregate.py`: snapshots in, JSON out (true daily usage, per session, per model, coordinator share, cache hit rate, outliers). Tests: `python3 -I scripts/test_aggregate.py`.
- `templates/dashboard.html`: the dashboard; `__DATA__` is replaced by the JSON.
- `skills/workflow-report`, `scripts/workflow_metrics.py`, `WEEKLY_PROMPT.md`: weekly per-item workflow numbers (lead time, CI minutes, pushes per PR, bugs found) from GitHub, no session data. Tests: `python3 -I scripts/test_workflow_metrics.py`.
- `annotations.example.csv`: releases, milestones and optimizations drawn on the timeline.

## Setup in a new project (about 5 minutes)
1. Create `<shared>/usage/` and copy `annotations.example.csv` there as `annotations.csv` (edit it).
2. Create a small dedicated thread "Usage snapshot" on a cheap model (Haiku class). It is the runner. Routines in private projects cannot start fresh sessions, so a dedicated thread keeps the context small.
3. Create a daily routine pointing at that thread with the text of `ROUTINE_PROMPT.md` (replace `<SHARED>`).
4. Ask for a usage report whenever you want one (`usage-report` skill).

## Cost design
Reads one listing per day and fetches only sessions with new activity since their last row. A quiet day costs a listing call and no rows. State is only in `snapshots.csv`, so the runner can be replaced at any time.

## Known limits
- Day 1 of tracking is a baseline (usage before tracking is not split by day).
- Usage of a session deleted before it was snapshotted is lost. Retention rules are unknown.
- Subagent usage appears folded into the parent session's total (unverified).
