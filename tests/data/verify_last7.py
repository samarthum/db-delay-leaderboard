#!/usr/bin/env python3
"""Independent check of data/last7.json against the raw files (RULES: a different query shape, same scope rules).

scripts/last7.py parses the XML with lxml, merges in DuckDB and groups runs in SQL. This file shares no code with it:
it reads the XML with regular expressions, keeps the latest snapshot per stop id in plain dicts, walks each ride's stops
in Python and re-derives the window, the missing hours and every cell for a sample of trains (or all with --all).
Exit 1 on any difference.

  python tests/data/verify_last7.py --raw DIR --json data/last7.json [--names names.json] [--sample 80 | --all]
"""
import argparse
import html
import json
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pyarrow.parquet as pq

TYPES = {"ICE", "IC", "EC", "ECE", "RJ", "RJX", "FLX", "TGV", "WB"}
S_BLOCK = re.compile(r"<s\b([^>]*?)(?:/>|>(.*?)</s>)", re.S)
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
REF = re.compile(r"<ref\b.*?</ref>", re.S)
STATION = re.compile(r'<timetable\b[^>]*\bstation="([^"]*)"')


def attrs(s):
    return {k: html.unescape(v) for k, v in ATTR.findall(s or "")}


def child(body, tag):
    """Attributes of the first <tag ...> directly in body (None when absent), with <ref> blocks cut out first."""
    m = re.search(rf"<{tag}\b([^>]*?)/?>", body)
    return attrs(m.group(1)) if m else None


def ts(v):
    try:
        return datetime.strptime(v, "%y%m%d%H%M") if v else None
    except ValueError:
        return None


def snapshot_berlin(t):
    if isinstance(t, str):
        t = datetime.fromisoformat(t)
    return t.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Europe/Berlin")).replace(tzinfo=None)


def rows_of(path, api):
    """(eva, Berlin snapshot time, xml) per successful answer; streamed, real raw files are large."""
    for batch in pq.ParquetFile(path).iter_batches(batch_size=200, columns=["timestamp", "url", "api_name", "response_data", "status_code"]):
        for r in batch.to_pylist():
            if r["api_name"] == api and r["status_code"] == "200" and r["response_data"]:
                yield r["url"].rstrip("/").split(f"{api}/")[1].split("/")[0], snapshot_berlin(r["timestamp"]), r["response_data"]


def ride_of(sid):
    m = re.fullmatch(r"(.*-\d{10})-\d+", sid)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--json", required=True)
    ap.add_argument("--names")
    ap.add_argument("--sample", type=int, default=80)
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    doc = json.loads(Path(a.json).read_text(encoding="utf-8"))
    if a.names:
        names = json.loads(Path(a.names).read_text(encoding="utf-8"))
    else:
        url = "https://raw.githubusercontent.com/piebro/deutsche-bahn-data/main/config/eva_to_station_name.json"
        try:
            names = json.load(urllib.request.urlopen(url, timeout=60))
        except Exception:  # noqa: BLE001
            names = {}

    keys = sorted(doc["trains"])
    if a.all:
        sample = set(keys)
    else:
        # Every train page, every train with a cancellation or an incomplete day, and an even spread of the rest.
        pages = {json.loads(p.read_text())["name"] for p in (Path(__file__).resolve().parents[2] / "data" / "trains").glob("*.json")}
        odd = {k for k in keys if any(c in ("x", "?") or (isinstance(c, list) and "x" in c) for c in doc["trains"][k][2])}
        step = max(1, len(keys) // a.sample)
        sample = (pages & set(keys)) | set(sorted(odd)[: a.sample]) | set(keys[::step])
    nums = {}
    for k in sample:
        tt, num = k.split(" ", 1)
        nums.setdefault(num, set()).add(tt)

    files = sorted((p for p in Path(a.raw).rglob("*.parquet")), key=lambda p: (tuple(int(x) for x in re.findall(r"(?:year|month|day)=(\d+)", str(p))), p.name))

    # Latest plan snapshot per stop id, for the sampled numbers only.
    plan, evas = {}, set()
    for f in files:
        for eva, snap, xml in rows_of(f, "timetables/v1/plan"):
            xml_name = (STATION.search(xml) or [None, None])[1]
            for head, body in S_BLOCK.findall(xml):
                body = body or ""
                tl = child(REF.sub("", body), "tl")
                if not tl or tl.get("n") not in nums or tl.get("c") not in nums[tl.get("n")]:
                    continue
                sid = attrs(head)["id"]
                if sid in plan and plan[sid]["snap"] >= snap:
                    continue
                ar, dp = child(body, "ar"), child(body, "dp")
                evas.add(eva)
                plan[sid] = {"snap": snap, "name": names.get(eva) or html.unescape(xml_name or ""), "tt": tl.get("c"),
                             "num": tl.get("n"), "pa": ts(ar and ar.get("pt")), "pd": ts(dp and dp.get("pt"))}
    rides = {ride_of(s) for s in plan}
    named = re.compile(r'\bn="(?:' + "|".join(re.escape(n) for n in sorted(nums)) + r')"')

    # Latest qualifying change snapshot per stop id (piebro's filter: some change, a cancellation, a status, an extra
    # stop, an extra train or a replacement reference).
    chg, snaps = {}, set()
    for f in files:
        for eva, snap, xml in rows_of(f, "timetables/v1/fchg"):
            snaps.add(snap)
            # Only stations where a sampled train calls, or answers naming a sampled number (extra stops, replacements).
            if eva not in evas and not named.search(xml):
                continue
            xml_name = (STATION.search(xml) or [None, None])[1]
            for head, body in S_BLOCK.findall(xml):
                body = body or ""
                sid = attrs(head).get("id", "")
                bare = REF.sub("", body)
                tl = child(bare, "tl")
                refm = re.search(r"<ref\b.*?<tl\b([^>]*?)/?>", body, re.S)
                ref = attrs(refm.group(1)) if refm else None
                if ride_of(sid) not in rides and not (tl and tl.get("n") in nums and tl.get("c") in TYPES):
                    continue
                ar, dp = child(bare, "ar"), child(bare, "dp")
                ar = ar if ar else None  # an element without attributes counts as absent
                dp = dp if dp else None
                if not ar and not dp and ref is None and not (tl and tl.get("t") == "e"):
                    continue
                g = lambda e, k: e.get(k) if e else None  # noqa: E731
                keep = any(ts(g(e, k)) for e in (ar, dp) for k in ("ct", "clt")) \
                    or any(g(e, "cs") is not None for e in (ar, dp)) or "a" in (g(ar, "ps"), g(dp, "ps")) \
                    or (tl and tl.get("t") == "e") or (ref is not None and any(ref.get(k) is not None for k in "cntof"))
                if not keep or (sid in chg and chg[sid]["snap"] >= snap):
                    continue
                chg[sid] = {"snap": snap, "name": names.get(eva) or html.unescape(xml_name or ""), "tt": g(tl, "c"), "num": g(tl, "n"),
                            "tl_t": g(tl, "t"), "ref": ref, "pa": ts(g(ar, "pt")), "pd": ts(g(dp, "pt")),
                            "ca": ts(g(ar, "ct")), "cd": ts(g(dp, "ct")), "clta": ts(g(ar, "clt")), "cltd": ts(g(dp, "clt")),
                            "csa": g(ar, "cs"), "csd": g(dp, "cs"), "psa": g(ar, "ps"), "psd": g(dp, "ps")}

    # Window: the newest day whose next morning (10:00 Berlin) is covered by a change list, and the six before it.
    newest = max(snaps)
    last = (newest - timedelta(days=1, hours=10)).date()
    days = [last - timedelta(days=i) for i in range(6, -1, -1)]
    problems = []
    if [d.isoformat() for d in days] != doc["days"]:
        problems.append(f"days: {doc['days']} vs {days}")

    # Missing hours: plan hours named by no file, and stretches between fetch runs more than 7 h apart.
    covered = set()
    for f in files:
        m = re.search(r"date_(\d{4}-\d{2}-\d{2})_hour_([\d_]+)\.parquet$", f.name)
        if m:
            base = datetime.fromisoformat(m.group(1))
            covered |= {base + timedelta(hours=int(h)) for h in m.group(2).split("_")}
    start = datetime.fromisoformat(days[0].isoformat())
    end = datetime.fromisoformat(days[-1].isoformat()) + timedelta(days=1, hours=10)
    hours = [start + timedelta(hours=i) for i in range(int((end - start).total_seconds() // 3600))]
    missing = {h for h in hours if h not in covered}
    starts = []
    for s in sorted(snaps):
        if not starts or s - starts[-1][-1] > timedelta(minutes=90):
            starts.append([s])
        else:
            starts[-1].append(s)
    run_starts = [r[0] for r in starts]
    for x, y in zip(run_starts, run_starts[1:]):
        if y - x > timedelta(hours=7):
            missing |= {h for h in hours if x.replace(minute=0, second=0, microsecond=0) <= h < y}
    if run_starts and run_starts[0] - timedelta(hours=6) > start:
        missing |= {h for h in hours if h < run_starts[0]}
    gaps = {}
    for h in sorted(missing):
        if days[0] <= h.date() <= days[-1]:
            gaps.setdefault(h.date().isoformat(), []).append(h.hour)
    if gaps != doc["gaps"]:
        problems.append(f"gaps: {doc['gaps']} vs {gaps}")

    # Stops per ride, merged like piebro's stop table.
    by_ride = {}
    for sid in set(plan) | set(chg):
        p, c = plan.get(sid), chg.get(sid)
        tt = (p or {}).get("tt") or (c or {}).get("tt")
        num = (p or {}).get("num") or (c or {}).get("num")
        if tt not in TYPES or num not in nums or tt not in nums[num]:
            continue
        repl = bool(c and (c["tl_t"] == "e" or (c["ref"] is not None and (c["ref"].get("c") is not None or c["ref"].get("n") is not None))))
        pa = (p or {}).get("pa") or (c or {}).get("pa")
        pd = (p or {}).get("pd") or (c or {}).get("pd")
        ca = (c or {}).get("ca") or pa
        cd = (c or {}).get("cd") or pd

        def cancelled(cs, clt):
            if c is None:
                return False
            return cs == "c" if cs is not None else clt is not None

        stop = {"seq": int(sid.rsplit("-", 1)[1]), "name": (p or c)["name"], "pa": pa, "pd": pd, "ca": ca, "cd": cd,
                "xa": cancelled(c and c["csa"], c and c["clta"]), "xd": cancelled(c and c["csd"], c and c["cltd"]),
                "plan": p is not None, "extra": bool(c and "a" in (c["psa"], c["psd"])), "repl": repl,
                "unit": f"{tt} {num}"}
        by_ride.setdefault(ride_of(sid), []).append(stop)

    mine = {}
    for ride, ss in by_ride.items():
        ss = [s for s in ss if not s["repl"]]
        if not ss:
            continue
        flagged = any(not s["plan"] and not s["extra"] for s in ss)
        timed = [s for s in ss if (s["cd"] or s["ca"]) is not None]
        if not timed:
            continue
        t0 = min(s["pd"] or s["pa"] for s in timed)
        t1 = max(s["pa"] or s["pd"] for s in timed)
        if not days[0] <= t0.date() <= days[-1]:
            continue
        h = t0.replace(minute=0)
        while h <= t1 + timedelta(hours=2):
            flagged |= h in missing
            h += timedelta(hours=1)
        deps = sorted((s for s in timed if s["pd"]), key=lambda s: s["seq"])
        arrs = sorted((s for s in timed if s["pa"]), key=lambda s: s["seq"])

        def end(s, kind):
            if s is None:
                return None
            if s["x" + kind]:
                return "x"
            plan_t, real = (s["pd"], s["cd"]) if kind == "d" else (s["pa"], s["ca"])
            m = int((real - plan_t).total_seconds() // 60)
            return m if -10 <= m <= 600 else None

        if flagged:
            cell = "?"
        elif all(s["xa"] or s["xd"] for s in timed):
            cell = "x"
        else:
            o, d = (deps[0] if deps else None), (arrs[-1] if arrs else None)
            cell = [end(o, "d"), end(d, "a"), (o or {}).get("name"), (d or {}).get("name")]
        unit = timed[0]["unit"]
        key = (unit, t0.date())
        if key not in mine or mine[key][0] > (t0, ride):
            mine[key] = ((t0, ride), cell)

    st = doc["stations"]
    checked = cells = 0
    for unit in sorted(sample):
        o, d, row = doc["trains"][unit]
        for i, day in enumerate(days):
            got = row[i]
            want = mine.get((unit, day), (None, None))[1]
            if isinstance(want, list):
                ro, rd = want[2], want[3]
                cmp = want[:2]
                if isinstance(got, list):
                    go = st[got[2]] if len(got) > 2 and got[2] is not None else (st[o] if o is not None else None)
                    gd = st[got[3]] if len(got) > 3 and got[3] is not None else (st[d] if d is not None else None)
                    if got[:2] != cmp or go != ro or gd != rd:
                        problems.append(f"{unit} {day}: file {got[:2]} {go} -> {gd}, recompute {cmp} {ro} -> {rd}")
                else:
                    problems.append(f"{unit} {day}: file {got}, recompute {cmp}")
            elif got != want:
                problems.append(f"{unit} {day}: file {got}, recompute {want}")
            cells += 1
        checked += 1
    # Every unit the recompute found for the sampled numbers is in the file.
    for (unit, day), _ in mine.items():
        if unit not in doc["trains"]:
            problems.append(f"{unit} missing from the file")
    print(f"verify_last7: {checked} trains, {cells} day cells compared, {len(problems)} differences")
    for p in problems[:40]:
        print("DIFF", p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
