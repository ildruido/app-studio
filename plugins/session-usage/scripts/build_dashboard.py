#!/usr/bin/env python3
"""One command: snapshots.csv (+ annotations.csv) -> dashboard page + data.json.

Usage: build_dashboard.py SNAPSHOTS.csv OUT_DIR  (writes OUT_DIR/index.html and OUT_DIR/data.json)
Publish index.html as the page and data.json via the Artifact "files" map: {"data.json": "<OUT_DIR>/data.json"}.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import csv
from aggregate import aggregate, load, load_meta

ap = argparse.ArgumentParser()
ap.add_argument("snapshots"); ap.add_argument("out")
ap.add_argument("--annotations"); ap.add_argument("--sessions"); ap.add_argument("--project", default="Project")
a = ap.parse_args()
data = aggregate(load(a.snapshots), load_meta(a.sessions))
data["project"] = a.project
data["annotations"] = []
if a.annotations and os.path.exists(a.annotations):
    with open(a.annotations, newline="") as f:
        data["annotations"] = [{"at": r["at"], "type": r["type"], "label": r["label"], "detail": r.get("detail", "")}
                               for r in csv.DictReader(f)]
tpl = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "templates", "dashboard.html")).read()
os.makedirs(a.out, exist_ok=True)
open(os.path.join(a.out, "index.html"), "w").write(tpl)
open(os.path.join(a.out, "data.json"), "w").write(json.dumps(data))
print("wrote", a.out)
