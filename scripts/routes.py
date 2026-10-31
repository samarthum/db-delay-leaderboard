#!/usr/bin/env python3
"""City-pair route pages: which A -> B trips get a page, and the numbers on it.

  python scripts/routes.py --data-dir DIR       # DIR holds data-YYYY-MM.parquet; needs data/stats.json only

A route is an ordered pair of German stations (Köln to Berlin and Berlin to Köln are two routes). Everything comes
straight from the Parquet runs, RUN BY RUN: a run counts for A -> B when it stops at A and later at B, and its delay is
the arrival delay at B, the stop where you get off. Nothing here depends on data/stops.json: that file drops trains whose
number is reused for different services, and for Hamburg to Berlin it keeps 51 of the 242 trains that run the pair.

Definitions are the same as compute.py and stops.py: the window and clamp come from data/stats.json, a delay is kept
when between clampMin and clampMax, a run is cancelled when the arrival or departure at B was cancelled, and the
share "late" is delay >= lateMinutes. `late6` is the same with 6 minutes, the threshold Deutsche Bahn itself uses
for "punctual", shown next to the 15-minute figure so nobody can call the 15 a spin.

A pair gets a page when both stations are busy (MAJOR_RUNS runs), the trip is a real trip, not a hop (the planned time
over the last RECENT_MONTHS months is at least MIN_MINUTES, which also drops pairs no train serves any more), it has at
least MIN_TRIPS measured arrivals and at least MIN_RATED listed trains with a figure of their own (MIN_TRAIN_RUNS runs).
The share on the page counts every run of the pair. The train list only shows trains that still run on a regular
schedule (planned departure within STABLE_MINUTES of the usual time in at least MIN_STABLE of the recent runs); runs of
reused train numbers are in the share but not in the list, and `unlisted` says how many.
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
MAJOR_RUNS = 2000  # a station needs this many runs in the window to be an end of a route page
MIN_MINUTES = 35  # shorter than this is a hop (Berlin Südkreuz -> Hbf), not a city pair
MIN_TRIPS = 4000  # measured arrivals at B
MIN_RATED = 2  # listed trains with a late share of their own on this pair
MIN_TRAIN_RUNS = 20  # measured runs before a single train gets a percentage
LEAGUE_MIN_TRIPS = 10000  # routes that may enter the "worst / best" league
CURVE_MIN_POINTS = 3
RECENT_MONTHS = 3  # "still runs" and "planned time" are judged on the last this many months
MIN_RECENT_RUNS = 3  # a train is listed when it ran at least this often in those months
STABLE_MINUTES = 30
MIN_STABLE = 0.8
STOP_SHARE = 0.3  # a stop between A and B counts for the curve when the busiest train calls there in this share of runs


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


def main():
    global MIN_TRIPS, MIN_MINUTES, MIN_RATED, MAJOR_RUNS
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="directory with data-YYYY-MM.parquet files")
    ap.add_argument("--cache-dir", default=str(Path(tempfile.gettempdir()) / "db-delay-parquet"))
    ap.add_argument("--stats", default="data/stats.json")
    ap.add_argument("--out", default="data/routes.json")
    ap.add_argument("--memory-limit", default="1500MB")
    ap.add_argument("--min-trips", type=int, default=MIN_TRIPS, help="measured arrivals a pair needs for a page")
    ap.add_argument("--min-minutes", type=int, default=MIN_MINUTES, help="recent planned minutes below which a pair is a hop")
    ap.add_argument("--min-rated", type=int, default=MIN_RATED, help="listed trains with a figure of their own a pair needs")
    ap.add_argument("--major-runs", type=int, default=MAJOR_RUNS, help="runs a station needs to be an end of a page")
    args = ap.parse_args()
    MIN_TRIPS, MIN_MINUTES, MIN_RATED, MAJOR_RUNS = args.min_trips, args.min_minutes, args.min_rated, args.major_runs

    stats = json.loads(Path(args.stats).read_text())
    window, p = stats["window"], stats["params"]
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    folder = Path(args.data_dir or args.cache_dir)
    sources = []
    for month in window["months"]:
        f = folder / f"data-{month}.parquet"
        if not f.exists():
            sys.exit(f"missing {f}")
        sources.append(str(f))
    recent = f"{window['months'][-RECENT_MONTHS]}-01"

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
        arrival_is_canceled or departure_is_canceled canc, arrival_planned_time arr_plan, departure_planned_time dep_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) d,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {RUN_KEY}) start
      from read_parquet({srcs})
      where not is_replacement_train and train_type in ({ld}))
    where strftime(start, '%Y-%m') in (select unnest({months}))
    """)
    log(f"stop rows: {con.execute('select count(*) from s').fetchone()[0]} in {time.time() - t0:.1f}s")

    con.execute(f"create table major as select name from s group by name having count(distinct run) >= {MAJOR_RUNS}")
    log(f"stations with >= {MAJOR_RUNS} runs: {con.execute('select count(*) from major').fetchone()[0]}")
    # Per run and station: the first stop where you can get on (it has a departure), the last where you can get off.
    # Stations are merged by name ("Berlin Hauptbahnhof" has a tief and an oben station id), so a run can list a name twice.
    con.execute("""create table sa as select run, tt, num, name, min(seq) seq, arg_min(dep_plan, seq) dep_plan, any_value(start) start
                   from s where dep_plan is not null and name in (select name from major) group by run, tt, num, name""")
    # The LAST row of the station in the run, whole: arg_max() skips NULL values, so three arg_max() columns can come
    # from different rows when a station is listed twice in a run (Berlin tief and oben), and that mixed row looked punctual.
    con.execute("""create table sb as select run, name, seq, d, canc, arr_plan from s where name in (select name from major)
                   qualify row_number() over (partition by run, name order by seq desc) = 1""")

    meas = f"not sb.canc and sb.arr_plan is not null and sb.d between {lo} and {hi}"
    pairs = con.execute(f"""
    select sa.name a, sb.name b, count(*) runs,
      count(*) filter (where {meas}) measured,
      count(*) filter (where {meas} and sb.d >= {late}) nlate,
      count(*) filter (where {meas} and sb.d >= 6) nlate6,
      coalesce(sum(sb.d) filter (where {meas}), 0) sumd,
      count(*) filter (where sb.canc) ncanc,
      median(date_diff('minute', sa.dep_plan, sb.arr_plan)) filter (where sa.start >= timestamp {sql_str(recent)} and sb.arr_plan is not null) mins
    from sa join sb on sa.run = sb.run and sa.seq < sb.seq and sa.name <> sb.name
    group by 1, 2
    having count(*) filter (where {meas}) >= {MIN_TRIPS}
    """).fetchall()
    sel = [r for r in pairs if r[8] is not None and r[8] >= MIN_MINUTES]
    log(f"pairs with >= {MIN_TRIPS} measured trips: {len(pairs)}; a real trip served lately (>= {MIN_MINUTES} min): {len(sel)} in {time.time() - t0:.1f}s")
    con.execute("create table sel(a varchar, b varchar)")
    con.executemany("insert into sel values (?, ?)", [(r[0], r[1]) for r in sel])

    # One row per (selected pair, run); narrow columns, a few million rows.
    con.execute("""
    create table pt as
    select sa.name a, sb.name b, sa.tt, sa.num, sa.run, sa.start, sa.dep_plan, sb.arr_plan, sb.d, sb.canc, sa.seq sas, sb.seq sbs
    from sa join sb on sa.run = sb.run and sa.seq < sb.seq and sa.name <> sb.name
    join sel on sel.a = sa.name and sel.b = sb.name
    """)
    log(f"pair runs: {con.execute('select count(*) from pt').fetchone()[0]} in {time.time() - t0:.1f}s")

    mt = f"not canc and arr_plan is not null and d between {lo} and {hi}"
    per_train = con.execute(f"""
    with r as (select *, hour(dep_plan) * 60 + minute(dep_plan) dep_t, date_diff('minute', dep_plan, arr_plan) pm from pt),
    m as (select a, b, tt, num, mode(dep_t) filter (where start >= timestamp {sql_str(recent)}) dep_mode from r group by 1, 2, 3, 4)
    select r.a, r.b, r.tt, r.num, count(*) runs,
      count(*) filter (where {mt}) measured,
      count(*) filter (where {mt} and d >= {late}) nlate,
      count(*) filter (where {mt} and d >= 6) nlate6,
      coalesce(sum(d) filter (where {mt}), 0) sumd,
      count(*) filter (where canc) ncanc,
      count(*) filter (where start >= timestamp {sql_str(recent)}) recent_runs,
      any_value(m.dep_mode) dep_mode,
      avg((abs(r.dep_t - m.dep_mode) <= {STABLE_MINUTES})::int) filter (where start >= timestamp {sql_str(recent)}) stable,
      median(pm) filter (where start >= timestamp {sql_str(recent)} and pm is not null) pmin
    from r join m using (a, b, tt, num) group by 1, 2, 3, 4
    """).fetchall()
    by_pair = defaultdict(list)
    for a, b, tt, num, runs, measured, nlate, nlate6, sumd, ncanc, rr, dep_mode, stable, pmin in per_train:
        by_pair[(a, b)].append(dict(tt=tt, num=num, runs=runs, measured=measured, nlate=nlate, nlate6=nlate6, sumd=sumd, ncanc=ncanc,
                                    listed=bool(rr >= MIN_RECENT_RUNS and dep_mode is not None and stable is not None and stable >= MIN_STABLE and pmin is not None),
                                    dep=dep_mode, pmin=pmin))
    log(f"per-train rows: {len(per_train)} in {time.time() - t0:.1f}s")

    # Where it falls apart: the late share at each stop of the busiest listed train, on its runs from A to B.
    busiest = {}
    for (a, b), trs in by_pair.items():
        cands = [x for x in trs if x["listed"] and x["measured"] >= MIN_TRAIN_RUNS]
        if cands:
            busiest[(a, b)] = max(cands, key=lambda x: x["measured"])
    con.execute("create table bt(a varchar, b varchar, tt varchar, num varchar)")
    con.executemany("insert into bt values (?, ?, ?, ?)", [(a, b, x["tt"], x["num"]) for (a, b), x in busiest.items()])
    curve = defaultdict(list)
    for a, b, name, n, nl, cnt, off in con.execute(f"""
        select p.a, p.b, s.name,
          count(*) filter (where not s.canc and s.arr_plan is not null and s.d between {lo} and {hi}) n,
          count(*) filter (where not s.canc and s.arr_plan is not null and s.d between {lo} and {hi} and s.d >= {late}) nl,
          count(*) cnt,
          median(date_diff('minute', p.dep_plan, s.arr_plan)) off
        from pt p join bt using (a, b, tt, num) join s on s.run = p.run and s.seq > p.sas and s.seq <= p.sbs
        group by p.a, p.b, s.name""").fetchall():
        curve[(a, b)].append((name, n, nl, cnt, off))

    routes = []
    unlisted_total = measured_total = 0
    for r in sel:
        a, b, runs, measured, nlate, nlate6, sumd, ncanc, mins = r
        trs = by_pair[(a, b)]
        listed_trs = [x for x in trs if x["listed"]]
        rated = [x for x in listed_trs if x["measured"] >= MIN_TRAIN_RUNS]
        if len(rated) < MIN_RATED:
            continue
        unlisted = sum(x["measured"] for x in trs if not x["listed"])
        unlisted_total += unlisted
        measured_total += measured
        listed = []
        for x in listed_trs:
            ok = x["measured"] >= MIN_TRAIN_RUNS
            listed.append([x["tt"], x["num"], int(x["dep"]), int(x["dep"] + x["pmin"]) % 1440,
                           round(100 * x["nlate"] / x["measured"], 1) if ok else None, x["measured"],
                           round(x["sumd"] / x["measured"], 1) if ok else None])
        listed.sort(key=lambda t: (t[2] - 240) % 1440)
        top = busiest[(a, b)]
        npts = top["runs"]
        stops = sorted((c for c in curve.get((a, b), []) if c[1] >= MIN_TRAIN_RUNS and c[3] >= STOP_SHARE * npts and c[4] is not None), key=lambda c: c[4])
        pts_out = [[short(n), round(100 * nl / m, 1), m] for n, m, nl, _, _ in stops]
        rated_sorted = sorted((x for x in rated if x["measured"] >= 100), key=lambda x: x["nlate"] / x["measured"])
        pick = lambda x: [x["tt"], x["num"], round(100 * x["nlate"] / x["measured"], 1), x["measured"]]
        routes.append({
            "slug": f"{slugify(short(a))}-{slugify(short(b))}",
            "from": short(a), "to": short(b),
            "runs": runs, "trips": measured,
            "late": round(100 * nlate / measured, 1),
            "late6": round(100 * nlate6 / measured, 1),
            "avg": round(sumd / measured, 1),
            "canc": round(100 * ncanc / runs, 1),
            "minutes": int(mins),
            "trains": len(listed), "rated": len(rated), "unlisted": unlisted,
            "list": listed,
            "bestTrain": pick(rated_sorted[0]) if rated_sorted else None,
            "worstTrain": pick(rated_sorted[-1]) if rated_sorted else None,
            "curve": {"train": f"{top['tt']} {top['num']}", "points": pts_out} if len(pts_out) >= CURVE_MIN_POINTS else None,
        })
    log(f"runs of reused train numbers counted in the shares but not listed: {unlisted_total} of {measured_total} ({100 * unlisted_total / max(measured_total, 1):.1f}%)")

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
        "generatedAt": stats.get("generatedAt"),
        "window": {k: window[k] for k in ("firstMonth", "lastMonth", "monthCount")},
        "params": {"minMinutes": MIN_MINUTES, "minTrips": MIN_TRIPS, "minRated": MIN_RATED, "minTrainRuns": MIN_TRAIN_RUNS,
                   "leagueMinTrips": LEAGUE_MIN_TRIPS, "lateMinutes": late, "majorRuns": MAJOR_RUNS, "recentMonths": RECENT_MONTHS},
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
