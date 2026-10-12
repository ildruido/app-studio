---
name: usage-report
description: Build the usage dashboard and a short summary from usage/snapshots.csv. Use when asked for usage, cost or token statistics for a project.
---

# Usage report

1. `python3 -I scripts/aggregate.py <SHARED>/usage/snapshots.csv /tmp/usage.json --annotations <SHARED>/usage/annotations.csv --project "<name>"`
2. Replace `__DATA__` in `templates/dashboard.html` with the JSON, write it to a scratch file and publish it as an Artifact (update the same URL each time, keep a stable title).
3. Reply with the headline numbers only: cost today and this week, coordinator share, outliers, cache hit rate. Link the dashboard.
Annotations: append a line `at,type,label,detail` to annotations.csv for each release, milestone or optimization (type is release, milestone or optimization). Day 1 of tracking is a baseline, not a day of usage.
