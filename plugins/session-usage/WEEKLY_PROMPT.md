Weekly workflow report (Mondays, after the usage report). Needs a session that can read the app repo and write <SHARED>/usage/workflow.csv. Do not edit snapshots.csv.

1. Check out or fetch docs/BACKLOG.md and docs/BACKLOG-DONE.md of the app repo into a scratch folder <REPO>.
2. Run, from this plugin's folder:
   python3 -I scripts/workflow_metrics.py --repo <OWNER/NAME> --prefix <XX> --since <today minus 35 days> --backlog <REPO>/docs/BACKLOG.md --backlog <REPO>/docs/BACKLOG-DONE.md --csv <SHARED>/usage/workflow.csv --report <OUT>/workflow-report.md --project "<name>"
3. Reply with the contents of workflow-report.md, nothing else. If it fails, one line naming the failure.
