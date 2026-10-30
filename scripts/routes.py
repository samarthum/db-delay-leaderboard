#!/usr/bin/env python3
"""City-pair route pages: which A -> B trips get a page, and the numbers on it.

  python scripts/routes.py --data-dir DIR       # after scripts/stops.py; DIR holds data-YYYY-MM.parquet

A route is an ordered pair of German stations that long-distance trains serve in that order (Köln to Berlin and
Berlin to Köln are two routes). Which pairs are candidates comes from data/stops.json (the timetable). Every number on
the page is then recomputed from the Parquet files RUN BY RUN: a run counts only if it stops at A and later at B, and
its delay is the arrival delay at B, the stop where you get off. (Pooling each train's arrivals at B would also count
runs that never stopped at A: for Köln to Berlin that is 8,208 arrivals against 6,163 real ones.)

Definitions are the same as compute.py and stops.py: the window and clamp come from data/stats.json, a delay is kept
when between clampMin and clampMax, a run is cancelled when the arrival or departure at B was cancelled, and the
share "late" is delay >= lateMinutes. `late6` is the same with 6 minutes, the threshold Deutsche Bahn itself uses
for "punctual", shown next to the 15-minute figure so nobody can call the 15 a spin.

A pair gets a page when it is a real trip, not a hop (typically at least MIN_MINUTES long), with at least MIN_TRIPS
measured arrivals and at least MIN_RATED trains that have a figure of their own (MIN_TRAIN_RUNS measured runs).
Places abroad do not get pages: the data stops at the border. Search still answers them.
"""
import argparse
import json
import re
import statistics
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path

import duckdb

RUN_KEY = r"hash(regexp_extract(id, '^(.*-\d{10})-\d+$', 1))"
MIN_MINUTES = 40  # shorter than this is a hop (Berlin Südkreuz -> Hbf), not a city pair
MIN_TRIPS = 6000  # measured arrivals at B, summed over the trains that run the pair
MIN_RATED = 3  # trains with a late share of their own on this pair
MIN_TRAIN_RUNS = 20  # measured runs before a single train gets a percentage
LEAGUE_MIN_TRIPS = 10000  # routes that may enter the "worst / best" league
CANDIDATE_MIN_TRIPS = 3500  # loose pre-filter on the timetable pass; the exact numbers decide
CURVE_MIN_POINTS = 3


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def slugify(s):
    s = s.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def short(name):
    """'Berlin Hauptbahnhof' -> 'Berlin Hbf': the short form every rider uses, and the one that fits a card.
    Keep in step with shortStation() in lib/routeSlug.ts: route addresses come from these names."""
    n = name.replace("Hauptbahnhof", "Hbf")
    if n == "Frankfurt am Main Flughafen Fernbahnhof":
        return "Frankfurt Flughafen"
    n = n.replace("Frankfurt (Main) ", "Frankfurt ")
    for suffix in (" (Westf)", " (Breisgau)", " (Saale)", " (Oder)"):
        n = n.replace(suffix, "")
    return n


def candidates(stops):
    """Ordered station pairs and the trains that serve them, from the timetable data (approximate numbers only)."""
    S = stops["stations"]
    pair = defaultdict(lambda: {"approx": 0, "trains": {}, "minutes": []})
    for t in stops["trains"]:
        tt, num, st = t[0], t[1], t[2]
        for i in range(len(st)):
            if st[i][1] is None:
                continue
            for j in range(i + 1, len(st)):
                a, b = st[i], st[j]
                if b[2] is None or b[8] <= a[8] or b[5] is None:
                    continue
                p = pair[(a[0], b[0])]
                p["approx"] += b[4]
                p["minutes"].append(b[8] - a[8])
                p["trains"][(tt, num)] = (a[1], a[1] + (b[8] - a[8]), i, j)
    out = {}
    for (a, b), p in pair.items():
        if p["approx"] >= CANDIDATE_MIN_TRIPS and statistics.median(p["minutes"]) >= MIN_MINUTES:
            out[(S[a], S[b])] = p
    return out


def main():
    global MIN_TRIPS, MIN_MINUTES, MIN_RATED, CANDIDATE_MIN_TRIPS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="directory with data-YYYY-MM.parquet files")
    ap.add_argument("--cache-dir", default=str(Path(tempfile.gettempdir()) / "db-delay-parquet"))
    ap.add_argument("--stops", default="data/stops.json")
    ap.add_argument("--stats", default="data/stats.json")
    ap.add_argument("--out", default="data/routes.json")
    ap.add_argument("--memory-limit", default="2GB")
    ap.add_argument("--min-trips", type=int, default=MIN_TRIPS, help="measured arrivals a pair needs for a page")
    ap.add_argument("--min-minutes", type=int, default=MIN_MINUTES, help="median planned minutes below which a pair is a hop")
    ap.add_argument("--min-rated", type=int, default=MIN_RATED, help="trains with a figure of their own a pair needs")
    args = ap.parse_args()
    MIN_TRIPS, MIN_MINUTES, MIN_RATED = args.min_trips, args.min_minutes, args.min_rated
    CANDIDATE_MIN_TRIPS = min(CANDIDATE_MIN_TRIPS, int(MIN_TRIPS * 0.6))

    stats = json.loads(Path(args.stats).read_text())
    stops = json.loads(Path(args.stops).read_text())
    window, p = stats["window"], stats["params"]
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    folder = Path(args.data_dir or args.cache_dir)
    sources = []
    for month in window["months"]:
        f = folder / f"data-{month}.parquet"
        if not f.exists():
            sys.exit(f"missing {f}")
        sources.append(str(f))

    cand = candidates(stops)
    log(f"candidate pairs from the timetable: {len(cand)}")

    tmp = Path(tempfile.gettempdir()) / "db-delay-duckdb"
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"set memory_limit = {sql_str(args.memory_limit)}; set temp_directory = {sql_str(str(tmp))}; set preserve_insertion_order = false")
    ld = ", ".join(sql_str(t) for t in p["longDistanceTypes"])
    months = "[" + ", ".join(sql_str(m) for m in window["months"]) + "]"
    srcs = "[" + ", ".join(sql_str(s) for s in sources) + "]"
    t0 = time.time()

    # Same stop table as stops.py: one row per stop of every long-distance run that started in the window.
    con.execute(f"""
    create table s as
    select * from (
      select {RUN_KEY} run, train_type tt, train_number num, train_line_station_num seq, station_name name,
        arrival_is_canceled or departure_is_canceled canc, arrival_planned_time arr_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) d,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {RUN_KEY}) start
      from read_parquet({srcs})
      where not is_replacement_train and train_type in ({ld}))
    where strftime(start, '%Y-%m') in (select unnest({months}))
    """)
    log(f"stop rows: {con.execute('select count(*) from s').fetchone()[0]} in {time.time() - t0:.1f}s")

    con.execute("create table cand(a varchar, b varchar, tt varchar, num varchar)")
    rows = [(a, b, tt, num) for (a, b), pc in cand.items() for (tt, num) in pc["trains"]]
    con.executemany("insert into cand values (?, ?, ?, ?)", rows)

    # One row per (pair, run): the run must stop at A and, later, at B.
    con.execute("""
    create table pr as
    select c.a, c.b, s.run, c.tt, c.num,
      min(s.seq) filter (where s.name = c.a) sa,
      max(s.seq) filter (where s.name = c.b) sb,
      arg_max(s.d, s.seq) filter (where s.name = c.b) db,
      arg_max(s.canc, s.seq) filter (where s.name = c.b) cb,
      arg_max(s.arr_plan, s.seq) filter (where s.name = c.b) apb
    from s join cand c on s.tt = c.tt and s.num = c.num and (s.name = c.a or s.name = c.b)
    group by c.a, c.b, s.run, c.tt, c.num
    having sa is not null and sb is not null and sa < sb
    """)
    log(f"pair runs: {con.execute('select count(*) from pr').fetchone()[0]} in {time.time() - t0:.1f}s")

    per_train = con.execute(f"""
    select a, b, tt, num, count(*) runs,
      count(*) filter (where not cb and apb is not null and db between {lo} and {hi}) measured,
      count(*) filter (where not cb and apb is not null and db between {lo} and {hi} and db >= {late}) nlate,
      count(*) filter (where not cb and apb is not null and db between {lo} and {hi} and db >= 6) nlate6,
      coalesce(sum(db) filter (where not cb and apb is not null and db between {lo} and {hi}), 0) sumd,
      count(*) filter (where cb) ncanc
    from pr group by a, b, tt, num
    """).fetchall()
    by_pair = defaultdict(list)
    for a, b, tt, num, runs, measured, nlate, nlate6, sumd, ncanc in per_train:
        by_pair[(a, b)].append(dict(tt=tt, num=num, runs=runs, measured=measured, nlate=nlate, nlate6=nlate6, sumd=sumd, ncanc=ncanc))

    # Where it falls apart: the late share at each stop of the busiest train, on the runs that go from A to B.
    curve_rows, busiest = [], {}
    for (a, b), trs in by_pair.items():
        top = max(trs, key=lambda x: x["measured"])
        busiest[(a, b)] = top
        t = next((t for t in stops["trains"] if t[0] == top["tt"] and t[1] == top["num"]), None)
        if not t:
            continue
        names = [stops["stations"][st[0]] for st in t[2]]
        if a not in names or b not in names or names.index(a) >= names.index(b):
            continue
        for n in names[names.index(a) + 1: names.index(b) + 1]:
            curve_rows.append((a, b, top["tt"], top["num"], n))
    con.execute("create table cv(a varchar, b varchar, tt varchar, num varchar, name varchar)")
    con.executemany("insert into cv values (?, ?, ?, ?, ?)", curve_rows)
    curve = defaultdict(list)
    for a, b, name, n, nl, avg in con.execute(f"""
        select cv.a, cv.b, cv.name,
          count(*) filter (where not s.canc and s.arr_plan is not null and s.d between {lo} and {hi}) n,
          count(*) filter (where not s.canc and s.arr_plan is not null and s.d between {lo} and {hi} and s.d >= {late}) nl,
          avg(s.d) filter (where not s.canc and s.arr_plan is not null and s.d between {lo} and {hi}) avg
        from pr join cv on pr.a = cv.a and pr.b = cv.b and pr.tt = cv.tt and pr.num = cv.num
        join s on s.run = pr.run and s.name = cv.name and s.seq > pr.sa and s.seq <= pr.sb
        group by cv.a, cv.b, cv.name""").fetchall():
        curve[(a, b)].append((name, n, nl, avg))

    routes = []
    for (a, b), trs in by_pair.items():
        pc = cand[(a, b)]
        measured = sum(x["measured"] for x in trs)
        rated = [x for x in trs if x["measured"] >= MIN_TRAIN_RUNS]
        if measured < MIN_TRIPS or len(rated) < MIN_RATED:
            continue
        runs = sum(x["runs"] for x in trs)
        listed = []
        for x in trs:
            dep, arr, *_ = pc["trains"][(x["tt"], x["num"])]
            ok = x["measured"] >= MIN_TRAIN_RUNS
            listed.append([x["tt"], x["num"], dep, arr % 1440, round(100 * x["nlate"] / x["measured"], 1) if ok else None, x["measured"]])
        listed.sort(key=lambda r: (r[2] - 240) % 1440)
        order = {n: i for i, n in enumerate(stops["stations"])}
        top = busiest[(a, b)]
        pts = {name: (n, nl, avg) for name, n, nl, avg in curve.get((a, b), [])}
        t = next(t for t in stops["trains"] if t[0] == top["tt"] and t[1] == top["num"])
        names = [stops["stations"][st[0]] for st in t[2]]
        seq = [n for n in names[names.index(a) + 1: names.index(b) + 1] if n in pts and pts[n][0] >= MIN_TRAIN_RUNS]
        pts_out = [[short(n), round(100 * pts[n][1] / pts[n][0], 1), pts[n][0]] for n in seq]
        rated_sorted = sorted((x for x in rated if x["measured"] >= 100), key=lambda x: x["nlate"] / x["measured"])
        pick = lambda x: [x["tt"], x["num"], round(100 * x["nlate"] / x["measured"], 1), x["measured"]]
        routes.append({
            "slug": f"{slugify(short(a))}-{slugify(short(b))}",
            "from": short(a), "to": short(b),
            "runs": runs, "trips": measured,
            "late": round(100 * sum(x["nlate"] for x in trs) / measured, 1),
            "late6": round(100 * sum(x["nlate6"] for x in trs) / measured, 1),
            "avg": round(sum(x["sumd"] for x in trs) / measured, 1),
            "canc": round(100 * sum(x["ncanc"] for x in trs) / runs, 1),
            "minutes": int(statistics.median(pc["minutes"])),
            "trains": len(trs), "rated": len(rated),
            "list": listed,
            "bestTrain": pick(rated_sorted[0]) if rated_sorted else None,
            "worstTrain": pick(rated_sorted[-1]) if rated_sorted else None,
            "curve": {"train": f"{top['tt']} {top['num']}", "points": pts_out} if len(pts_out) >= CURVE_MIN_POINTS else None,
        })

    slugs = defaultdict(int)
    for r in routes:
        slugs[r["slug"]] += 1
    clash = [k for k, v in slugs.items() if v > 1]
    if clash:
        sys.exit(f"slug clash: {clash}")

    league = sorted((r for r in routes if r["trips"] >= LEAGUE_MIN_TRIPS), key=lambda r: -r["late"])
    for i, r in enumerate(league):
        r["rank"] = i + 1  # 1 = latest
    for r in routes:
        r.setdefault("rank", None)
    routes.sort(key=lambda r: r["slug"])

    doc = {
        "generatedAt": stops.get("generatedAt"),
        "window": stops["window"],
        "params": {"minMinutes": MIN_MINUTES, "minTrips": MIN_TRIPS, "minRated": MIN_RATED, "minTrainRuns": MIN_TRAIN_RUNS,
                   "leagueMinTrips": LEAGUE_MIN_TRIPS, "lateMinutes": late},
        "leagueSize": len(league),
        "routes": routes,
    }
    out = Path(args.out)
    payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
    if not out.exists() or out.read_text() != payload:
        out.write_text(payload)
    log(f"routes: {len(routes)} pages, league of {len(league)}, {len(payload) / 1e6:.2f} MB -> {out} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
