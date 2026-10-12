#!/usr/bin/env python3
"""Aggregate usage snapshots into dashboard JSON.

Usage: aggregate.py SNAPSHOTS.csv OUT.json [--annotations ANN.csv] [--project NAME]

snapshots.csv columns: taken_at,session_id,kind,title,parent_session_id,model,
status,input,output,cache_read,cache_write,cost_usd  (counters are cumulative)
annotations.csv columns: at,type,label,detail   (type: release|milestone|optimization)
"""
import argparse, csv, json, os, re, statistics
from collections import defaultdict
from datetime import datetime, timedelta

NUM = ("input", "output", "cache_read", "cache_write")


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)


def norm(sid):
    """cse_X and session_X name the same session."""
    return re.sub(r"^(cse|session)_", "", sid)


def load_meta(path):
    """sessions.csv: session_id,created_at,desc  (optional; fills dates and tooltips)."""
    meta = {}
    if path and os.path.exists(path):
        with open(path, newline="") as f:
            for r in csv.DictReader(f):
                meta[norm(r["session_id"])] = r
    return meta


def load(path):
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            r["session_id"] = norm(r["session_id"])
            for k in NUM:
                r[k] = int(r[k] or 0)
            r["cost_usd"] = float(r["cost_usd"] or 0)
            r["ts"] = parse_ts(r["taken_at"])
            rows.append(r)
    rows.sort(key=lambda r: r["ts"])
    return rows


def totals(r):
    nc = r["input"] + r["output"] + r["cache_write"]
    return {"nc": nc, "all": nc + r["cache_read"], "cost": r["cost_usd"]}


def aggregate(rows, meta=None):
    meta = meta or {}
    by = defaultdict(list)
    for r in rows:
        by[r["session_id"]].append(r)
    first_day = min(r["ts"].date() for r in rows)
    last_day = max(r["ts"].date() for r in rows)

    latest = {sid: rs[-1] for sid, rs in by.items()}
    sessions = []
    for sid, r in latest.items():
        t = totals(r)
        sessions.append({
            "id": sid, "kind": r["kind"], "title": r["title"], "model": r["model"],
            "status": r["status"], **t,
            "date": (meta.get(sid, {}).get("created_at") or by[sid][0]["taken_at"])[:10],
            "desc": meta.get(sid, {}).get("desc") or r["title"],
        })
    sessions.sort(key=lambda s: s["date"])

    # cumulative per session at the end of each day (last snapshot of that day or earlier)
    days = []
    d = first_day
    while d <= last_day:
        days.append(d)
        d += timedelta(days=1)
    daily = []
    prev = {sid: {"nc": 0, "all": 0, "cost": 0.0} for sid in by}
    for day in days:
        end = datetime.combine(day, datetime.max.time())
        acc = {"nc": 0, "all": 0, "cost": 0.0}
        active = 0
        by_model = defaultdict(float)
        coord_cost = 0.0
        for sid, rs in by.items():
            seen = [r for r in rs if r["ts"] <= end]
            if not seen:
                continue
            cur = totals(seen[-1])
            delta = {k: cur[k] - prev[sid][k] for k in cur}
            # a session first seen on the very first snapshot day is baseline (history before tracking)
            if day == first_day and rs[0]["ts"].date() == first_day and len(rs) >= 1 and prev[sid]["nc"] == 0:
                baseline = True
            else:
                baseline = False
            if delta["nc"] > 0 and not baseline:
                active += 1
                for k in acc:
                    acc[k] += delta[k]
                by_model[seen[-1]["model"]] += delta["cost"]
                if seen[-1]["kind"] == "coordinator":
                    coord_cost += delta["cost"]
            prev[sid] = cur
        daily.append({"d": day.isoformat(), "active": active, "baseline": day == first_day,
                      **acc, "by_model": dict(by_model), "coord_cost": coord_cost})

    threads = [s for s in sessions if s["kind"] == "thread" and s["cost"] > 0]
    med = statistics.median([s["cost"] for s in threads]) if threads else 0
    outliers = [s["id"] for s in threads if med and s["cost"] > 3 * med]
    tot_cost = sum(s["cost"] for s in sessions)
    coord = sum(s["cost"] for s in sessions if s["kind"] == "coordinator")
    cr = sum(r["cache_read"] for r in latest.values())
    denom = cr + sum(r["input"] + r["cache_write"] for r in latest.values())
    return {
        "sessions": sessions,
        "daily": daily,
        "summary": {
            "total_cost": round(tot_cost, 4),
            "coordinator_share": round(coord / tot_cost, 4) if tot_cost else 0,
            "cache_hit_rate": round(cr / denom, 4) if denom else 0,
            "median_thread_cost": round(med, 4),
            "outliers": outliers,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("snapshots"); ap.add_argument("out")
    ap.add_argument("--annotations"); ap.add_argument("--sessions"); ap.add_argument("--project", default="Project")
    a = ap.parse_args()
    out = aggregate(load(a.snapshots), load_meta(a.sessions))
    ann = []
    if a.annotations:
        with open(a.annotations, newline="") as f:
            ann = [{"at": r["at"], "type": r["type"], "label": r["label"], "detail": r.get("detail", "")}
                   for r in csv.DictReader(f)]
    out["annotations"] = ann
    out["project"] = a.project
    with open(a.out, "w") as f:
        json.dump(out, f)


if __name__ == "__main__":
    main()
