#!/usr/bin/env python3
"""Workflow metrics per backlog item, from GitHub pull requests and Actions runs.

Four numbers per item:
  lead_hours       first commit of the first work PR -> last work PR merged (proxy for In progress -> To test)
  ci_minutes       billed minutes (each job rounded up) of runs on the item's PR branches
                   while the PR was open, plus the push run on the merge commit
  pushes_per_pr    commits per work PR (the repo rule is one push per feature)
  bugs             bug items in the backlog that name this item as where they were found

Usage:
  workflow_metrics.py --repo OWNER/NAME --prefix CC --since 2026-10-01 \
      --backlog docs/BACKLOG.md --backlog docs/BACKLOG-DONE.md \
      --csv usage/workflow.csv --report /tmp/workflow-report.md [--until DATE]
  workflow_metrics.py --from-json data.json ...   # offline, same output

Stdlib only. GITHUB_TOKEN/GH_TOKEN is used when set; the cloud proxy needs none.
"""
import argparse, csv, datetime as dt, json, math, os, re, statistics, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = "https://api.github.com"
WORK = ("feat", "fix", "refactor", "perf")


def parse_ts(s):
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def api_get(path):
    req = urllib.request.Request(API + path, headers={"Accept": "application/vnd.github+json"})
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def fetch_file(repo, path, ref="main"):
    """A file from the repo's default branch, so no clone is needed."""
    req = urllib.request.Request(f"{API}/repos/{repo}/contents/{path}?ref={ref}", headers={"Accept": "application/vnd.github.raw+json"})
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode()


def first_commit(repo, number):
    """Date of the PR's first commit: the work starts there, often well before the PR is opened."""
    c = api_get(f"/repos/{repo}/pulls/{number}/commits?per_page=100")
    return min((x["commit"]["author"]["date"] for x in c), default=None)


def fetch(repo, since):
    """Merged PRs updated since `since` (with commit counts), CI runs since then, and their jobs."""
    merged, page = [], 1
    while True:
        batch = api_get(f"/repos/{repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page={page}")
        if not batch:
            break
        for p in batch:
            if p.get("merged_at") and parse_ts(p["merged_at"]) >= since:
                merged.append(p["number"])
        if parse_ts(batch[-1]["updated_at"]) < since:
            break
        page += 1
    def one_pr(n):
        full = api_get(f"/repos/{repo}/pulls/{n}")
        return {k: full.get(k) for k in ("number", "title", "body", "created_at", "merged_at", "commits", "merge_commit_sha")} | {"head_ref": full["head"]["ref"], "first_commit_at": first_commit(repo, n)}

    with ThreadPoolExecutor(8) as ex:
        prs = list(ex.map(one_pr, merged))
    runs, page = [], 1
    while True:
        batch = api_get(f"/repos/{repo}/actions/runs?per_page=100&page={page}").get("workflow_runs", [])
        if not batch:
            break
        runs += [{k: r[k] for k in ("id", "event", "head_branch", "head_sha", "run_started_at", "conclusion", "created_at")} for r in batch]
        if parse_ts(batch[-1]["created_at"]) < since - dt.timedelta(days=1):
            break
        page += 1
    wanted = {r["id"] for r in runs if r["conclusion"] != "skipped"}
    def one_run(rid):
        return rid, [{"started_at": j["started_at"], "completed_at": j["completed_at"]} for j in api_get(f"/repos/{repo}/actions/runs/{rid}/jobs?per_page=100")["jobs"]]

    with ThreadPoolExecutor(8) as ex:
        jobs = dict(ex.map(one_run, wanted))
    return {"prs": prs, "runs": runs, "jobs": jobs}


def pr_kind(title):
    m = re.match(r"(\w+)(\([^)]*\))?!?:", title)
    t = m.group(1) if m else ""
    if t == "chore" and "(release)" in title:
        return "release"
    return "work" if t in WORK else "other"


def item_ids(pr, prefix):
    rx = re.compile(rf"\b{prefix}-\d{{3}}[a-z]?\b")
    return rx.findall(pr["title"]) or rx.findall((pr.get("body") or "")[:2000]) or rx.findall(pr.get("head_ref") or "")


def job_minutes(jobs):
    total = 0
    for j in jobs:
        a, b = parse_ts(j["started_at"]), parse_ts(j["completed_at"])
        if a and b:
            total += max(1, math.ceil((b - a).total_seconds() / 60))
    return total


def bug_parents(backlog_text, prefix):
    """Bug item -> the item it was found in. Reads `Found in: ... <XX>-0NN` or, for older items, 'in the <XX>-0NN test'."""
    id_rx = rf"{prefix}-\d{{3}}[a-z]?"
    parents = {}
    for block in re.split(r"(?m)^### ", backlog_text)[1:]:
        head, _, body = block.partition("\n")
        m = re.match(rf"({id_rx})\b(.*)", head)
        if not m or not re.search(r"\bbug\b", head, re.I):
            continue
        text = body[:1200]
        f = re.search(rf"Found in:[^\n]*?({id_rx})", text) or re.search(rf"\bin the ({id_rx}) test", head + " " + text)
        if f and f.group(1) != m.group(1):
            parents[m.group(1)] = f.group(1)
    return parents


def compute(data, backlog_text, prefix):
    runs = [r for r in data["runs"] if r["conclusion"] != "skipped"]
    items = {}
    for pr in data["prs"]:
        ids = item_ids(pr, prefix)
        if not ids:
            continue
        kind = pr_kind(pr["title"])
        opened, merged = parse_ts(pr["created_at"]), parse_ts(pr["merged_at"])
        started = min(filter(None, [opened, parse_ts(pr.get("first_commit_at"))]))
        mine = [r for r in runs if (r["event"] == "pull_request" and r["head_branch"] == pr["head_ref"]
                                    and opened - dt.timedelta(minutes=2) <= parse_ts(r["run_started_at"]) <= merged)
                or (r["event"] == "push" and r["head_sha"] == pr.get("merge_commit_sha"))]
        minutes = sum(job_minutes(data["jobs"].get(r["id"], data["jobs"].get(str(r["id"]), []))) for r in mine)
        it = items.setdefault(ids[0], {"item": ids[0], "work_prs": [], "all_prs": [], "ci_minutes": 0, "opened": None, "merged": None, "commits": 0})
        it["all_prs"].append(pr["number"])
        it["ci_minutes"] += minutes
        if kind == "work":
            it["work_prs"].append(pr["number"])
            it["commits"] += pr.get("commits") or 0
            it["opened"] = min(filter(None, [it["opened"], started]))
            it["merged"] = max(filter(None, [it["merged"], merged]))
    bugs = {}
    for _, parent in bug_parents(backlog_text, prefix).items():
        bugs[parent] = bugs.get(parent, 0) + 1
    rows = []
    for it in items.values():
        if not it["work_prs"]:
            continue
        rows.append({
            "item": it["item"],
            "prs": " ".join(f"#{n}" for n in it["all_prs"]),
            "opened": it["opened"].strftime("%Y-%m-%d %H:%M"),
            "merged": it["merged"].strftime("%Y-%m-%d %H:%M"),
            "lead_hours": round((it["merged"] - it["opened"]).total_seconds() / 3600, 1),
            "ci_minutes": it["ci_minutes"],
            "pushes_per_pr": round(it["commits"] / len(it["work_prs"]), 1),
            "bugs": bugs.get(it["item"], 0),
        })
    return sorted(rows, key=lambda r: r["merged"])


FIELDS = ["item", "prs", "opened", "merged", "lead_hours", "ci_minutes", "pushes_per_pr", "bugs"]


def write_csv(path, rows):
    """Upsert by item id so reruns refresh numbers without duplicating."""
    old = {}
    if os.path.exists(path):
        with open(path, newline="") as f:
            old = {r["item"]: r for r in csv.DictReader(f)}
    for r in rows:
        prev = old.get(r["item"])
        # a short window sees only part of an old item's PRs: keep the fuller earlier row then
        if prev is None or set(r["prs"].split()) >= set(prev["prs"].split()):
            old[r["item"]] = r
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(sorted(old.values(), key=lambda r: r["merged"]))


def med(rows, k):
    return round(statistics.median(float(r[k]) for r in rows), 1) if rows else "-"


def report(rows, until, project="", days=7):
    """One screen: this week's items, then the median of the last four weeks for the trend."""
    start = until - dt.timedelta(days=days)
    key = lambda r: dt.datetime.strptime(r["merged"], "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc)
    week = [r for r in rows if start < key(r) <= until]
    prior = [r for r in rows if start - dt.timedelta(days=21) < key(r) <= start]
    out = [f"# Workflow report{' - ' + project if project else ''}, week to {until:%Y-%m-%d}", ""]
    if week:
        out += ["| Item | Lead time (h) | CI min | Pushes/PR | Bugs found |", "|---|---:|---:|---:|---:|"]
        out += [f"| {r['item']} | {r['lead_hours']} | {r['ci_minutes']} | {r['pushes_per_pr']} | {r['bugs']} |" for r in week]
        out += ["", f"Items finished: {len(week)}. Median lead time {med(week, 'lead_hours')} h, CI {med(week, 'ci_minutes')} min, pushes per PR {med(week, 'pushes_per_pr')}, bugs found {sum(int(r['bugs']) for r in week)}."]
    else:
        out += ["No items finished this week."]
    if prior:
        out += [f"Previous 3 weeks ({len(prior)} items): lead time {med(prior, 'lead_hours')} h, CI {med(prior, 'ci_minutes')} min, pushes per PR {med(prior, 'pushes_per_pr')}, bugs found {sum(int(r['bugs']) for r in prior)}."]
    out += ["", "Lead time = first commit of the first work PR to last merged (proxy for In progress to To test; git dates can understate planning time). CI = billed minutes, jobs rounded up. Bugs = bug items naming the item in `Found in:`."]
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo")
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--since", required=True, help="YYYY-MM-DD, or 'auto': 7 days before the newest merge in --csv, else 35 days ago")
    ap.add_argument("--until")
    ap.add_argument("--backlog", action="append", default=[])
    ap.add_argument("--csv", required=True)
    ap.add_argument("--backlog-remote", action="append", default=[], help="path in --repo to read from its default branch, e.g. docs/BACKLOG.md (no clone needed)")
    ap.add_argument("--report")
    ap.add_argument("--project", default="")
    ap.add_argument("--from-json")
    ap.add_argument("--save-json")
    a = ap.parse_args()
    if a.since == "auto":
        newest = None
        if os.path.exists(a.csv):
            with open(a.csv, newline="") as f:
                ms = [r["merged"] for r in csv.DictReader(f) if r.get("merged")]
            newest = dt.datetime.strptime(max(ms), "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc) if ms else None
        since = (newest - dt.timedelta(days=7)) if newest else dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=35)
    else:
        since = dt.datetime.fromisoformat(a.since).replace(tzinfo=dt.timezone.utc)
    until = dt.datetime.fromisoformat(a.until).replace(tzinfo=dt.timezone.utc) if a.until else dt.datetime.now(dt.timezone.utc)
    if a.from_json:
        data = json.load(open(a.from_json))
    else:
        data = fetch(a.repo, since)
        if a.save_json:
            json.dump(data, open(a.save_json, "w"))
    text = "\n".join([open(p).read() for p in a.backlog] + [fetch_file(a.repo, p) for p in a.backlog_remote])
    rows = compute(data, text, a.prefix)
    write_csv(a.csv, rows)
    with open(a.csv, newline="") as f:
        allrows = list(csv.DictReader(f))
    counts = {}
    for parent in bug_parents(text, a.prefix).values():
        counts[parent] = counts.get(parent, 0) + 1
    for r in allrows:  # bugs arrive after an item is done: refresh them on every row
        r["bugs"] = counts.get(r["item"], 0)
    with open(a.csv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(allrows)
    rep = report(allrows, until, a.project)
    if a.report:
        open(a.report, "w").write(rep)
    print(rep)


if __name__ == "__main__":
    sys.exit(main())
