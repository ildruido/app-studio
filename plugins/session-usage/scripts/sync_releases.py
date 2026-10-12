#!/usr/bin/env python3
"""Append release markers to annotations.csv from GitHub commits titled "chore(release): vX.Y.Z".

Usage: sync_releases.py ANNOTATIONS.csv --repo OWNER/NAME
Reads commits on the default branch (no tags needed, so unpushed tags don't matter). Adds only versions newer
than the newest version already in the file. Stdlib only; failures print a warning and exit 0 (best effort).
"""
import argparse, csv, json, os, re, urllib.request

def versions_in(rows):
    out = []
    for r in rows:
        for m in re.finditer(r"v(\d+)\.(\d+)(?:\.(\d+))?", r["label"] if r["type"] == "release" else ""):
            out.append((int(m[1]), int(m[2]), int(m[3] or 0)))
    return out

def fetch(repo, pages=3):
    for p in range(1, pages + 1):
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}/commits?per_page=100&page={p}")
        tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
        if tok:
            req.add_header("Authorization", "Bearer " + tok)
        with urllib.request.urlopen(req, timeout=30) as r:
            yield from json.load(r)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("annotations"); ap.add_argument("--repo", required=True)
    a = ap.parse_args()
    try:
        rows = list(csv.DictReader(open(a.annotations, newline=""))) if os.path.exists(a.annotations) else []
        newest = max(versions_in(rows), default=(0, 0, 0))
        new = []
        for c in fetch(a.repo):
            msg = c["commit"]["message"].split("\n")[0]
            m = re.match(r"chore\(release\): v(\d+)\.(\d+)\.(\d+)", msg)
            if m and tuple(map(int, m.groups())) > newest:
                v = tuple(map(int, m.groups()))
                new.append((c["commit"]["committer"]["date"][:16], "v%d.%d.%d" % v))
        if not new:
            return
        new.sort()
        with open(a.annotations, "a", newline="") as f:
            w = csv.writer(f)
            for at, label in new:
                w.writerow([at, "release", label, f"{label} released"])
        print("added", [l for _, l in new])
    except Exception as e:
        print("warning: release sync skipped:", e)

main()
