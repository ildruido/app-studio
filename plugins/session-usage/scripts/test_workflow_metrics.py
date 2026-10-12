import datetime as dt, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
import workflow_metrics as w

D = {
    "prs": [
        {"number": 1, "title": "feat(x): thing (XX-001)", "body": "", "created_at": "2026-10-01T10:00:00Z", "merged_at": "2026-10-01T12:30:00Z", "commits": 3, "merge_commit_sha": "m1", "head_ref": "b"},
        {"number": 2, "title": "chore(release): v0.1.0 (#2)", "body": "Refs: XX-001", "created_at": "2026-10-01T13:00:00Z", "merged_at": "2026-10-01T13:10:00Z", "commits": 1, "merge_commit_sha": "m2", "head_ref": "b"},
        {"number": 3, "title": "docs: nothing", "body": "", "created_at": "2026-10-02T10:00:00Z", "merged_at": "2026-10-02T10:05:00Z", "commits": 1, "merge_commit_sha": "m3", "head_ref": "b"},
    ],
    "runs": [
        {"id": 10, "event": "pull_request", "head_branch": "b", "head_sha": "s", "run_started_at": "2026-10-01T11:00:00Z", "conclusion": "success", "created_at": "2026-10-01T11:00:00Z"},
        {"id": 11, "event": "push", "head_branch": "main", "head_sha": "m1", "run_started_at": "2026-10-01T12:31:00Z", "conclusion": "success", "created_at": "2026-10-01T12:31:00Z"},
        {"id": 12, "event": "pull_request", "head_branch": "b", "head_sha": "s", "run_started_at": "2026-10-01T11:00:00Z", "conclusion": "skipped", "created_at": "2026-10-01T11:00:00Z"},
    ],
    "jobs": {"10": [{"started_at": "2026-10-01T11:00:00Z", "completed_at": "2026-10-01T11:00:20Z"}, {"started_at": "2026-10-01T11:00:00Z", "completed_at": "2026-10-01T11:03:10Z"}],
             "11": [{"started_at": "2026-10-01T12:31:00Z", "completed_at": "2026-10-01T12:31:50Z"}]},
}
BACKLOG = """## Ready
### XX-005 Bug: button does nothing
- Found in: v0.1.0 (XX-001), step 2
### XX-006 Bug: old style (found by Ale in the XX-001 test)
### XX-007 Bug: unknown origin
- Found in: v0.1.0, step 1
### XX-008 Feature, not a bug
- Found in the XX-001 area
"""


class T(unittest.TestCase):
    def test_item_numbers(self):
        rows = w.compute(D, BACKLOG, "XX")
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual((r["item"], r["lead_hours"], r["pushes_per_pr"], r["bugs"]), ("XX-001", 2.5, 3.0, 2))
        self.assertEqual(r["ci_minutes"], 1 + 4 + 1)  # jobs rounded up, skipped run ignored, push run on merge commit counted

    def test_report_and_upsert(self):
        rows = w.compute(D, BACKLOG, "XX")
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "w.csv")
            w.write_csv(p, rows)
            w.write_csv(p, rows)
            import csv
            self.assertEqual(len(list(csv.DictReader(open(p)))), 1)
            rep = w.report(list(csv.DictReader(open(p))), dt.datetime(2026, 10, 5, tzinfo=dt.timezone.utc))
            self.assertIn("XX-001", rep)

    def test_partial_window_keeps_fuller_row(self):
        full = w.compute(D, BACKLOG, "XX")
        part = [dict(full[0], prs="#2", lead_hours=0.1)]
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "w.csv")
            w.write_csv(p, full)
            w.write_csv(p, part)
            import csv
            self.assertEqual(float(list(csv.DictReader(open(p)))[0]["lead_hours"]), 2.5)

    def test_bug_count_never_drops(self):
        full = w.compute(D, BACKLOG, "XX")
        later = w.compute(D, "", "XX")  # bug item archived without its heading
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "w.csv")
            w.write_csv(p, full)
            w.write_csv(p, later)
            import csv
            self.assertEqual(int(list(csv.DictReader(open(p)))[0]["bugs"]), 2)

    def test_empty_week(self):
        self.assertIn("No items", w.report([], dt.datetime(2026, 10, 5, tzinfo=dt.timezone.utc)))


if __name__ == "__main__":
    unittest.main()
