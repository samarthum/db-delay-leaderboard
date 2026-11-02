#!/usr/bin/env python3
"""Monthly history refresh: decide, run the pipeline, gate the result (.github/workflows/monthly.yml).

  python scripts/monthly.py plan [--today 2026-11-02]          # act=true|false: is there a finished month to add?
  python scripts/monthly.py plan --recompute                    # act=true on the committed window (a rule change)
  python scripts/monthly.py run --data-dir DIR [--download]     # compute.py -> stops.py -> routes.py -> connections.py -> compensation.py
  python scripts/monthly.py gate --old OLD_DATA_DIR [--expect advance|same|recompute]   # sanity gate + diff summary

piebro publishes monthly_processed_data/data-YYYY-MM.parquet a few days into the next month. The site's window is the
latest PUBLISHED_MONTHS (12) published months that have full station coverage (compute.py), so adding a month moves the
window's end forward by exactly one month (and its start too once 12 full months exist). `plan` says act=true only when
the last finished month is published and data/stats.json does not cover it yet, so the daily check is a no-op otherwise.
`plan --recompute` (workflow_dispatch input `recompute`) instead reruns the committed window, for a change of a rule (the
Nov 2026 last-stop fix): the gate then expects the same window, the same runs per month, and figures that moved a little.

Every data file of the history is rewritten for the new window by the current scripts; nothing is merged by hand. The
RULES ("never overwrite committed data with a fresh compute wholesale") guard against a local window that differs from the
committed one and against losing fields that were merged in; here the window is the full published one, and the gate
refuses any result in which a field of the committed files has vanished (`shape`), a file family shrank, or the window
did not move as expected. Independent re-checks against the Parquet are in tests/data/verify_monthly.py.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"

# The files the history pipeline writes (relative to the data folder). Anything else changing is a bug.
OUTPUTS = ["stats.json", "monthly.json", "stations.json", "stops.json", "routes.json", "connections.json",
           "connection-pairs.json", "connections-daypart.json", "compensation.json"]
OUTPUT_DIRS = ["trains", "lines", "search"]
# Dicts keyed by data (train names, slugs, stations), whose keys may come and go: their values' shapes are compared.
MAPS = {"connection-pairs.json": [(), ("*", "s")], "connections-daypart.json": [(), ("*",), ("*", "*")],
        "compensation.json": [("routes",), ("types",)], "search/index.json": [("shards",), ("types",)]}
# Recompute of the same window (a rule change): how far a month's network average and measured count may move. The
# last-stop fix moves ~4% of long-distance runs' measuring stop; a month moving more than this is a bug, not a fix.
RECOMPUTE_MAX_AVG_MOVE = 2.0  # minutes
RECOMPUTE_MAX_MEASURED_MOVE = 0.05  # share
# Size bounds: a new file must be within this factor of the committed one and under the absolute cap (bytes).
SIZE_FACTOR = (0.7, 1.5)
SIZE_CAP = {"routes.json": 3e6, "stops.json": 2e6, "connection-pairs.json": 7e6, "connections-daypart.json": 1e6,
            "connections.json": 5e5, "stations.json": 1e6, "compensation.json": 2e5, "search": 9e6}


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def month_add(month, n):
    y, m = map(int, month.split("-"))
    m += n
    y, m = y + (m - 1) // 12, (m - 1) % 12 + 1
    return f"{y:04d}-{m:02d}"


def output(**kv):
    lines = [f"{k}={v}" for k, v in kv.items()]
    print("\n".join(lines))
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write("\n".join(lines) + "\n")


def summary(text):
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(text + "\n")


# ---------------------------------------------------------------- plan

def plan(args):
    today = date.fromisoformat(args.today) if args.today else datetime.now(timezone.utc).date()
    finished = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    covered = json.loads(Path(args.stats).read_text())["window"]["lastMonth"]
    if args.listing:
        published = [m for m in json.loads(Path(args.listing).read_text())]
    else:
        sys.path.insert(0, str(SCRIPTS))
        import compute  # noqa: E402  (listing only; needs network)
        published = [m for m, _, _ in compute.list_remote()]
    newest = published[-1] if published else None
    if args.recompute:
        # A rule changed: rerun the committed window (a newly published month waits for the next scheduled run).
        log(f"recompute of the committed window (ends {covered}); newest published: {newest}")
        output(act="true", month=covered, covered=covered, expect="recompute", until=covered, recompute="true")
        return
    if covered >= finished:
        act, why = False, f"data/stats.json already covers {finished} (window ends {covered})"
    elif finished not in published:
        act, why = False, f"{finished} is not published yet (newest published: {newest})"
    elif month_add(covered, 1) != finished:
        # More than one month behind: the gate expects exactly one, so a person should look (run with --expect).
        act, why = True, f"window ends {covered}, {finished} is published: MORE than one month to add"
    else:
        act, why = True, f"{finished} is published and data/stats.json ends {covered}"
    log(why)
    # until: the newest month the run may use (a dry run without a new month recomputes the committed window; a pull
    # request may change a rule, so that dry run is gated like a recompute).
    output(act=str(act).lower(), month=finished, covered=covered, expect="advance" if act else "recompute",
           until=finished if act else covered, recompute="false")


# ---------------------------------------------------------------- run

def run(args):
    out = Path(args.out_dir)
    py = sys.executable
    src = ["--cache-dir", args.data_dir] if args.download else ["--data-dir", args.data_dir]
    stats = str(out / "stats.json")
    steps = [
        ["compute.py", *src, "--out-dir", str(out)] + (["--stations-csv", args.stations_csv] if args.stations_csv else [])
        + (["--until", args.until] if args.until else []),
        ["stops.py", "--data-dir", args.data_dir, "--stats", stats, "--out", str(out / "stops.json")],
        ["routes.py", "--data-dir", args.data_dir, "--stats", stats, "--out", str(out / "routes.json")]
        + (["--min-trips", str(args.min_trips)] if args.min_trips else []),
        ["connections.py", "--data-dir", args.data_dir, "--stats", stats, "--out", str(out / "connections.json")],
        ["compensation.py", "--data-dir", args.data_dir, "--stats", stats, "--routes", str(out / "routes.json"),
         "--out", str(out / "compensation.json")],
    ]
    for step in steps:
        t0 = time.time()
        log(f"== {' '.join(step)}")
        r = subprocess.run([py, str(SCRIPTS / step[0]), *step[1:]], cwd=ROOT)
        if r.returncode:
            sys.exit(f"{step[0]} failed ({r.returncode})")
        log(f"== {step[0]} done in {time.time() - t0:.0f}s")


# ---------------------------------------------------------------- gate

def load(folder, name):
    p = Path(folder) / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def shape(obj, path=(), maps=()):
    """Set of key paths in obj, to tell whether a field vanished.

    Dict keys are fields, except in MAPS (keyed by data: trains, slugs, stations), where every key reads "*". A list is a
    sequence: its elements merge under "[]". A list element that holds a scalar is a positional record, and its positions
    count as fields ("#3"); a list of lists (a train's stops, a route's train rows) is a sequence, whose length does not.
    """
    out = set()
    if isinstance(obj, dict):
        is_map = any(len(m) == len(path) and all(a == "*" or a == b for a, b in zip(m, path)) for m in maps)
        for k, v in obj.items():
            key = "*" if is_map else k
            out.add(path + (key,))
            out |= shape(v, path + (key,), maps)
    elif isinstance(obj, list):
        for v in obj:
            out |= shape(v, path + ("[]",), maps)
            if isinstance(v, list) and any(x is None or isinstance(x, (str, int, float, bool)) for x in v):
                out |= {path + ("[]", f"#{j}") for j in range(len(v))}
    return out


def gate(args):
    old, new = Path(args.old), Path(args.new)
    problems, notes = [], []

    def check(cond, msg):
        (notes if cond else problems).append(("ok   " if cond else "FAIL ") + msg)

    so, sn = load(old, "stats.json"), load(new, "stats.json")
    wo, wn = so["window"], sn["window"]
    months = wn["months"]
    contiguous = all(month_add(a, 1) == b for a, b in zip(months, months[1:]))
    check(contiguous, f"window months contiguous: {months[0]}..{months[-1]} ({len(months)})")
    if args.expect == "advance":
        check(wn["lastMonth"] == month_add(wo["lastMonth"], 1),
              f"window end moved forward exactly one month: {wo['lastMonth']} -> {wn['lastMonth']}")
        check(wn["firstMonth"] in (wo["firstMonth"], month_add(wo["firstMonth"], 1)),
              f"window start kept or moved one month: {wo['firstMonth']} -> {wn['firstMonth']}")
        check(wn["monthCount"] in (wo["monthCount"], wo["monthCount"] + 1) and wn["monthCount"] <= 12,
              f"month count {wo['monthCount']} -> {wn['monthCount']}")
    else:
        check(wn["months"] == wo["months"], f"window unchanged: {wo['firstMonth']}..{wo['lastMonth']}")

    # Every file of the history speaks of the same window.
    w3 = {k: wn[k] for k in ("firstMonth", "lastMonth", "monthCount")}
    for name in ["monthly.json", "stops.json", "routes.json", "connections.json", "compensation.json"]:
        doc = load(new, name)
        got = {k: doc["window"][k] for k in w3} if doc and "window" in doc else None
        check(got == w3, f"{name} window = stats window")
    idx = load(new, "search/index.json")
    check(idx and idx["window"] == w3, "search/index.json window = stats window")

    # Rows per month: the new month looks like the others; months both windows hold are unchanged (same source file).
    mo, mn = load(old, "monthly.json"), load(new, "monthly.json")
    bytes_o = {p["month"]: p["bytes"] for p in wo.get("published", [])}
    bytes_n = {p["month"]: p["bytes"] for p in wn.get("published", [])}
    for cat in mn["series"]:
        old_by = {m["month"]: m for m in mo["series"].get(cat, [])}
        same = [m for m in mn["series"][cat] if m["month"] in old_by and bytes_o.get(m["month"]) == bytes_n.get(m["month"])]
        if args.expect == "recompute":
            # A rule changed, the source did not: every run is still there (a run's existence does not depend on where it
            # is measured); averages and measured counts may move, a little.
            runs_diff = [m["month"] for m in same if m["runs"] != old_by[m["month"]]["runs"]]
            check(not runs_diff and len(same) == len(mn["series"][cat]),
                  f"{cat}: runs per month unchanged in all {len(same)} months" + (f" (differ: {runs_diff})" if runs_diff else ""))
            moves = [(abs((m["avgDelayMin"] or 0) - (old_by[m["month"]]["avgDelayMin"] or 0)), m["month"]) for m in same]
            meas = [(abs(m["measured"] - old_by[m["month"]]["measured"]) / max(old_by[m["month"]]["measured"], 1), m["month"]) for m in same]
            big, big_m = max(moves, default=(0, None))
            mb, mb_m = max(meas, default=(0, None))
            check(big <= RECOMPUTE_MAX_AVG_MOVE, f"{cat}: monthly average moved at most {big:.1f} min ({big_m}); limit {RECOMPUTE_MAX_AVG_MOVE}")
            check(mb <= RECOMPUTE_MAX_MEASURED_MOVE, f"{cat}: measured runs per month moved at most {100 * mb:.2f}% ({mb_m}); "
                  f"limit {100 * RECOMPUTE_MAX_MEASURED_MOVE:.0f}%")
        else:
            diff = [m["month"] for m in same if m != old_by[m["month"]]]
            check(not diff, f"{cat}: {len(same)} months both windows hold are unchanged" + (f" (differ: {diff})" if diff else ""))
        runs = sorted(m["runs"] for m in mn["series"][cat][:-1]) or [mn["series"][cat][-1]["runs"]]
        med = runs[len(runs) // 2]
        last = mn["series"][cat][-1]
        check(0.75 * med <= last["runs"] <= 1.33 * med,
              f"{cat}: runs in {last['month']} {last['runs']:,} vs median month {med:,}")
        share = last["measured"] / last["runs"] if last["runs"] else 0
        check(share >= 0.8, f"{cat}: {100 * share:.1f}% of {last['month']}'s runs measured")
        check(last["avgDelayMin"] is not None and -2 <= last["avgDelayMin"] <= 30,
              f"{cat}: average delay {last['month']} {last['avgDelayMin']} min")

    # Families: nothing disappears en masse.
    def keep(label, old_set, new_set, max_lost, min_ratio=0.9):
        lost = old_set - new_set
        frac = len(lost) / max(len(old_set), 1)
        check(frac <= max_lost and len(new_set) >= min_ratio * len(old_set),
              f"{label}: {len(old_set):,} -> {len(new_set):,} ({len(lost):,} gone = {100 * frac:.1f}%, {len(new_set - old_set):,} new)"
              + (f" e.g. {sorted(lost)[:5]}" if lost and frac > max_lost else ""))
        return lost

    ro, rn = load(old, "routes.json"), load(new, "routes.json")
    keep("route pages", {r["slug"] for r in ro["routes"]}, {r["slug"] for r in rn["routes"]}, 0.10)
    back = [(r["slug"], x[0], x[1]) for r in rn["routes"] for x in r["list"] if (x[3] - x[2]) % 1440 > 720]
    check(not back, f"route lists: {len(back)} rows whose arrival is more than 12 h after departure" + (f" e.g. {back[:3]}" if back else ""))
    old_trips = {r["slug"]: r["trips"] for r in ro["routes"]}
    ratios = sorted(r["trips"] / old_trips[r["slug"]] for r in rn["routes"] if r["slug"] in old_trips and old_trips[r["slug"]])
    if ratios:
        med = ratios[len(ratios) // 2]
        check(0.8 <= med <= 1.3, f"route trips, median new/old {med:.3f}")
    for folder in ("trains", "lines"):
        keep(f"{folder} pages", {p.stem for p in (old / folder).glob("*.json")}, {p.stem for p in (new / folder).glob("*.json")},
             0.6, 0.8)

    def search_units(folder):
        out = {}
        for p in sorted((Path(folder) / "search").glob("s-*.json")):
            for r in json.loads(p.read_text(encoding="utf-8")):
                out[(r[2], r[0], r[1], r[13] if len(r) > 13 else None)] = r
        return out
    uo, un = search_units(old), search_units(new)
    for kind, label in ((0, "search: trains"), (1, "search: lines"), (2, "search: regional train numbers")):
        keep(label, {k for k in uo if k[0] == kind}, {k for k in un if k[0] == kind}, 0.15, 0.85)
    trains = [r for k, r in un.items() if k[0] == 0]
    current = sum(1 for r in trains if len(r) > 17 and r[17] and r[17][-1][0] == wn["lastMonth"])
    check(all(len(r) > 17 for r in un.values()), "search: every record has its latest months (field 17)")
    # About 70% in a normal month (Sep 2026: 1,203 of 1,732; the rest did not run that month), so half catches a
    # missing or empty month without failing on seasonal trains.
    check(current >= 0.5 * len(trains), f"search: {current:,} of {len(trains):,} trains have figures for {wn['lastMonth']}")

    stops_o, stops_n = load(old, "stops.json"), load(new, "stops.json")
    keep("stops.json trains", {f"{t[0]} {t[1]}" for t in stops_o["trains"]}, {f"{t[0]} {t[1]}" for t in stops_n["trains"]}, 0.15, 0.85)
    keep("connections stations", {s["name"] for s in load(old, "connections.json")["stations"]},
         {s["name"] for s in load(new, "connections.json")["stations"]}, 0.10)
    keep("connection-pairs arriving trains", set(load(old, "connection-pairs.json")), set(load(new, "connection-pairs.json")), 0.20, 0.8)
    keep("stations.json", {s["name"] for s in load(old, "stations.json")["stations"]},
         {s["name"] for s in load(new, "stations.json")["stations"]}, 0.10)
    comp = load(new, "compensation.json")
    check(set(comp["routes"]) == {r["slug"] for r in rn["routes"]}, "compensation.json routes = route pages")
    check(comp["monthly"][-1]["month"] == wn["lastMonth"], f"compensation.json monthly ends {comp['monthly'][-1]['month']}")

    # Fields: no key path of a committed file vanished.
    for name in OUTPUTS + ["search/index.json"]:
        a, b = load(old, name), load(new, name)
        if a is None:
            continue
        maps = MAPS.get(name, [])
        lost = shape(a, (), maps) - shape(b, (), maps)
        check(not lost, f"{name}: no field vanished" + (f" (gone: {sorted(lost)[:5]})" if lost else ""))
    for folder, label in (("trains", "train pages"), ("lines", "line pages")):
        so_, sn_ = set(), set()
        for p in (old / folder).glob("*.json"):
            so_ |= shape(json.loads(p.read_text(encoding="utf-8")))
        for p in (new / folder).glob("*.json"):
            sn_ |= shape(json.loads(p.read_text(encoding="utf-8")))
        check(not (so_ - sn_), f"{label}: no field vanished" + (f" (gone: {sorted(so_ - sn_)[:5]})" if so_ - sn_ else ""))
    old_len = max((len(r) for r in uo.values()), default=0)
    check(all(len(r) >= old_len for r in un.values()), f"search records keep all {old_len} positions")

    # Sizes.
    def size(folder, name):
        p = Path(folder) / name
        return sum(f.stat().st_size for f in p.glob("*.json")) if p.is_dir() else (p.stat().st_size if p.exists() else 0)
    for name in OUTPUTS + ["search"]:
        a, b = size(old, name), size(new, name)
        lo, hi = SIZE_FACTOR
        ok = (not a or lo * a <= b <= hi * a) and b <= SIZE_CAP.get(name, 2e7) and b > 0
        check(ok, f"size {name}: {a / 1e3:,.0f} kB -> {b / 1e3:,.0f} kB")

    summary(f"### Monthly refresh: {wo['firstMonth']}..{wo['lastMonth']} -> {wn['firstMonth']}..{wn['lastMonth']}\n")
    for line in notes + problems:
        summary(f"    {line}")
    diff_summary(old, new, ro, rn, so, sn)
    if problems:
        summary(f"\n{len(problems)} gate check(s) failed: not committing.")
        sys.exit(1)
    summary(f"\nAll {len(notes)} gate checks passed.")


def diff_summary(old, new, ro, rn, so, sn):
    """What a reader would see change: headline numbers, route pages, train pages."""
    out = ["", "#### What changes"]
    for cat in ("longDistance", "regional"):
        a, b = so["headline"]["categories"].get(cat), sn["headline"]["categories"].get(cat)
        if a and b:
            out.append(f"    headline {cat}: avg {a['avgDelayMin']} -> {b['avgDelayMin']} min, cancelled {a['fullCancelPct']} -> "
                       f"{b['fullCancelPct']}% (months {so['headline']['months'][0]}..{so['headline']['months'][-1]} -> "
                       f"{sn['headline']['months'][0]}..{sn['headline']['months'][-1]})")
    ra = {r["slug"]: r for r in ro["routes"]}
    rb = {r["slug"]: r for r in rn["routes"]}
    out.append(f"    route pages {len(ra)} -> {len(rb)}: gone {sorted(set(ra) - set(rb))[:8]}, new {sorted(set(rb) - set(ra))[:8]}")
    moved = sorted(((rb[s]["avg"] - ra[s]["avg"], s) for s in set(ra) & set(rb)), key=lambda x: -abs(x[0]))[:5]
    out.append("    biggest route average moves: " + ", ".join(f"{s} {ra[s]['avg']} -> {rb[s]['avg']}" for _, s in moved))
    rows_o = sum(len(r["list"]) for r in ra.values())
    rows_n = sum(len(r["list"]) for r in rb.values())
    out.append(f"    route list rows {rows_o:,} -> {rows_n:,}; league {ro['leagueSize']} -> {rn['leagueSize']}")
    for folder in ("trains", "lines"):
        a = {p.stem for p in (Path(old) / folder).glob("*.json")}
        b = {p.stem for p in (Path(new) / folder).glob("*.json")}
        out.append(f"    {folder} pages {len(a)} -> {len(b)}: gone {sorted(a - b)}, new {sorted(b - a)}")
    for line in out:
        summary(line)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--today", help="YYYY-MM-DD (default: today, UTC)")
    p.add_argument("--stats", default=str(ROOT / "data" / "stats.json"))
    p.add_argument("--listing", help="JSON list of published months instead of asking Hugging Face (tests)")
    p.add_argument("--recompute", action="store_true", help="act on the committed window (a rule changed)")
    p = sub.add_parser("run")
    p.add_argument("--data-dir", required=True, help="folder of data-YYYY-MM.parquet (the download cache with --download)")
    p.add_argument("--download", action="store_true", help="let compute.py download the latest published months into --data-dir")
    p.add_argument("--out-dir", default=str(ROOT / "data"))
    p.add_argument("--stations-csv")
    p.add_argument("--until", help="newest month to use (YYYY-MM; plan's month), so a later partial file never slips in")
    p.add_argument("--min-trips", type=int, help="routes.py --min-trips (fixture tests only)")
    p = sub.add_parser("gate")
    p.add_argument("--old", required=True, help="copy of the data folder before the run")
    p.add_argument("--new", default=str(ROOT / "data"))
    p.add_argument("--expect", choices=["advance", "same", "recompute"], default="advance",
                   help="advance: one new month; same: nothing may change; recompute: same window and runs, figures may move")
    args = ap.parse_args()
    {"plan": plan, "run": run, "gate": gate}[args.cmd](args)


if __name__ == "__main__":
    main()
