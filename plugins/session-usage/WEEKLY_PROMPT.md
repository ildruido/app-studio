Weekly workflow report (Mondays, after the usage report). Needs network to api.github.com and write access to <SHARED>/usage/workflow.csv. No repo clone needed. Do not edit snapshots.csv.

1. Run, from this plugin's folder (`<SHARED>/plugins/session-usage`):
   python3 -I scripts/workflow_metrics.py --repo <OWNER/NAME> --prefix <XX> --since auto --backlog-remote docs/BACKLOG.md --backlog-remote docs/BACKLOG-DONE.md --csv <SHARED>/usage/workflow.csv --report <OUT>/workflow-report.md --project "<name>"
   Allow up to 10 minutes (run it in the background and wait if the shell times out); `--since auto` fetches only the last week plus a margin, 35 days on a first run.
2. Reply with the contents of workflow-report.md, nothing else. If it fails, one line naming the failure.
