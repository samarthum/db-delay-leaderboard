#!/usr/bin/env python3
"""Per-stop delay of long-distance trains, for route search ("Köln to Berlin").

Reads the same monthly Parquet files and the same window as compute.py (data/stats.json says which months),
and writes data/stops.json. For every long-distance train number with enough measured runs it stores, for each
stop the train serves: the typical planned arrival and departure time, how many runs were scheduled and measured
there, the share that arrived `lateMinutes` or more late, the average delay and the share cancelled at that stop.

  python scripts/stops.py --data-dir DIR        # read local data-YYYY-MM.parquet files
  python scripts/stops.py                       # use the cache that compute.py downloads into

Definitions (kept the same as compute.py):
  run      one train number on one scheduled day (RUN_KEY), counted in the month of its first scheduled stop
  delay    minutes between planned and actual arrival at that stop; kept when between clampMin and clampMax
  cancelled at a stop: the arrival or the departure at that stop was cancelled
Stops are merged by station name (Berlin Hbf has two station ids) and ordered by their median planned time after
the run's first stop, so a train that sometimes ends at Südkreuz and sometimes at Ostbahnhof keeps the order of the
timetable. Stops served in under MIN_STOP_SHARE of a train's busiest stop are detours and are left out.

Some train numbers are reused for unrelated services (ICE 2831 runs from Hamburg, Köln, Berlin and München on
different days), and the source starts a run at different stops of the same train (ICE 619 begins at Hamburg Hbf,
Dammtor or Altona). So a stop is kept only when it is stable: at least MIN_STABLE of its runs are planned within
STABLE_MINUTES of its median planned time of day. A stop that is served at 04:30 by one service and at 14:00 by
another is dropped, so a route can never join two different services. Stops are ordered by that median planned time
(minutes after midnight of the run's first day), not by position from the first recorded stop.

The source records only stops inside Germany, so Amsterdam, Zürich or Wien exist only as the destination label of a
run ("final_destination_station"). A train whose runs mostly (MIN_DEST_SHARE) end at one such foreign label gets that
label as its fourth field: route search can then answer "Düsseldorf to Amsterdam", measuring the delay at the train's
last stop in Germany, which is all that is recorded.
"""
import argparse
import json
import re
import sys
import unicodedata
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import duckdb

RUN_KEY = r"hash(regexp_extract(id, '^(.*-\d{10})-\d+$', 1))"
# Stop order and duplicate stops: the same rule as compute.py (planned time, then stop number; a station listed twice at
# the same planned times is one stop).
from compute import ONE_ROW_PER_STOP, STOP_ORDER  # noqa: E402
FILE_RE = re.compile(r"(?:^|/)data-(\d{4}-\d{2})\.parquet$")
MIN_UNIT_RUNS = 3  # a train needs this many measured runs to appear in route search; below MIN_STOP_RUNS it has no percentage
MIN_STOP_RUNS = 20  # measured arrivals a stop needs before its late share and average are shown
STABLE_MINUTES = 30  # a run is on schedule at a stop when its planned time is within this of the stop's median
MIN_STABLE = 0.8  # a stop is kept when at least this share of its runs are on schedule in that sense
MIN_DEST_SHARE = 0.6  # share of a train's runs that must end at the same foreign label
MIN_STOP_SHARE = 0.3  # a stop served in fewer than this share of the busiest stop's runs is a detour


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def norm(s):
    """Folded station name for comparing a destination label with station names: 'Frankfurt(Main)Hbf' = 'Frankfurt (Main) Hbf'."""
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\s*gl\.\s*[\d\-]+\s*$", "", s)
    s = s.replace("hauptbahnhof", "hbf").replace("(main)", "").replace("(m)", "")
    return re.sub(r"[^a-z0-9]", "", s)


def first_word(s):
    return re.split(r"[\s(]", s.strip())[0].lower()


NOT_ABROAD = {"Dagebüll Mole", "Nürnberg Hbf (Nelson-Mandela-Platz/Südausgang)"}  # German places with an odd label
PRETTY = {"Koebenhavn H": "København H", "Koebenhavns Lufthavn st": "Københavns Lufthavn", "Fredericia st": "Fredericia",
          "Padborg st": "Padborg"}


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def sql_list(items):
    return "[" + ", ".join(sql_str(i) for i in items) + "]"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="directory with data-YYYY-MM.parquet files")
    ap.add_argument("--cache-dir", default=str(Path(tempfile.gettempdir()) / "db-delay-parquet"))
    ap.add_argument("--stats", default="data/stats.json", help="stats.json written by compute.py (window and parameters)")
    ap.add_argument("--out", default="data/stops.json")
    ap.add_argument("--memory-limit", default="2GB")
    args = ap.parse_args()

    stats = json.loads(Path(args.stats).read_text())
    window, p = stats["window"], stats["params"]
    folder = Path(args.data_dir or args.cache_dir)
    sources = []
    for month in window["months"]:
        f = folder / f"data-{month}.parquet"
        if not f.exists():
            sys.exit(f"missing {f}")
        sources.append(str(f))

    tmp = Path(tempfile.gettempdir()) / "db-delay-duckdb"
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"set memory_limit = {sql_str(args.memory_limit)}; set temp_directory = {sql_str(str(tmp))};"
                " set preserve_insertion_order = false")
    ld = ", ".join(sql_str(t) for t in p["longDistanceTypes"])
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    t0 = time.time()

    # One row per stop of every long-distance run that started in the window.
    con.execute(f"""
    create table s as
    select * from (
      select {RUN_KEY} run, train_type tt, train_number num, {STOP_ORDER} ord,
        try_cast(eva as integer) eva, station_name name,
        arrival_is_canceled or departure_is_canceled canc, final_destination_station dest,
        arrival_planned_time arr_plan, departure_planned_time dep_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) d,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {RUN_KEY}) start
      from read_parquet({sql_list(sources)})
      where not is_replacement_train and train_type in ({ld})
      {ONE_ROW_PER_STOP})
    where eva is not null and strftime(start, '%Y-%m') in (select unnest({sql_list(window['months'])}))
    """)
    log(f"stops: {con.execute('select count(*) from s').fetchone()[0]} rows in {time.time() - t0:.1f}s")

    # Stations are merged by name: "Berlin Hauptbahnhof" has a tief and an oben station id.

    # Units with enough measured runs, judged the way compute.py judges them: the delay at the last stop (by planned
    # time) that was not cancelled and has a planned arrival.
    con.execute(f"""
    create table units as
    select tt, num from (
      select run, any_value(tt) tt, any_value(num) num,
        arg_max(d, ord) filter (where not canc and arr_plan is not null and d is not null) fin
      from s group by run)
    group by tt, num
    having count(*) filter (where fin between {lo} and {hi}) >= {MIN_UNIT_RUNS}
    """)
    log(f"units: {con.execute('select count(*) from units').fetchone()[0]}")

    per = con.execute(f"""
    with j as (
      select s.tt, s.num, s.name, s.run, s.canc, s.arr_plan, s.dep_plan, s.d,
        date_diff('minute', date_trunc('day', s.start), coalesce(s.arr_plan, s.dep_plan)) off
      from s join units using (tt, num))
    select tt, num, name,
      count(*) runs,
      count(*) filter (where not canc and arr_plan is not null and d between {lo} and {hi}) measured,
      100.0 * count(*) filter (where not canc and arr_plan is not null and d between {lo} and {hi} and d >= {late})
        / nullif(count(*) filter (where not canc and arr_plan is not null and d between {lo} and {hi}), 0) late,
      avg(d) filter (where not canc and arr_plan is not null and d between {lo} and {hi}) avg,
      100.0 * avg(canc::int) canc,
      mode(hour(arr_plan) * 60 + minute(arr_plan)) arr_t,
      mode(hour(dep_plan) * 60 + minute(dep_plan)) dep_t,
      median(off) off,
      count(arr_plan) has_arr,
      avg((abs(off - moff) <= {STABLE_MINUTES})::int) stable
    from (select j.*, median(off) over (partition by tt, num, name) moff from j) group by tt, num, name
    order by tt, num, off, name
    """).fetchall()
    log(f"unit-stop rows: {len(per)} in {time.time() - t0:.1f}s")

    busiest = {}
    for r in per:
        busiest[(r[0], r[1])] = max(busiest.get((r[0], r[1]), 0), r[3])
    before = len(per)
    per = [r for r in per if r[3] >= MIN_STOP_SHARE * busiest[(r[0], r[1])] and r[12] >= MIN_STABLE]
    log(f"stable stops: {len(per)} of {before}")
    used = sorted({r[2] for r in per})
    index = {n: i for i, n in enumerate(used)}

    # Foreign destinations: labels that are not a German station (the label of a run is the same on all its rows).
    german = {norm(r[0]) for r in con.execute("select distinct name from s").fetchall()}
    labels = {}
    for tt, num, dest, last, n in con.execute("""
        select tt, num, dest, mode(last) last, count(*) n from (
          select run, any_value(tt) tt, any_value(num) num, any_value(dest) dest, arg_max(name, ord) last
          from s group by run) where dest is not null group by tt, num, dest""").fetchall():
        labels.setdefault((tt, num), []).append((n, dest, last))
    foreign_of = {}
    for key, rows in labels.items():
        total = sum(n for n, _, _ in rows)
        n, dest, last = max(rows)
        if n < MIN_DEST_SHARE * total:
            continue
        if norm(dest) in german or first_word(dest) == first_word(last) or "(Gr)" in dest or dest in NOT_ABROAD:
            continue
        foreign_of[key] = PRETTY.get(dest, dest)
    foreign_names = sorted(set(foreign_of.values()))
    log(f"trains heading abroad: {len(foreign_of)} to {len(foreign_names)} labels")

    trains, cur, key = [], None, None
    for tt, num, eva, runs, measured, late_pct, avg, canc, arr_t, dep_t, off, has_arr, stable in per:
        if (tt, num) != key:
            key, cur = (tt, num), []
            trains.append([tt, num, cur, foreign_names.index(foreign_of[key]) if key in foreign_of else None])
        ok = measured >= MIN_STOP_RUNS
        # A stop with no planned arrival in most runs is the start of the run: there is no arrival delay to show.
        arr = arr_t if has_arr * 2 >= runs else None
        cur.append([index[eva], dep_t, arr, runs, measured,
                    round(late_pct, 1) if ok and late_pct is not None else None,
                    round(avg, 1) if ok and avg is not None else None,
                    round(canc, 1), int(off)])
    trains = [t for t in trains if len(t[2]) >= 2]
    trains.sort(key=lambda t: (t[0], t[1].zfill(8)))
    for t in trains:  # the fourth field is omitted when the train does not end abroad, to keep the file small
        if t[3] is None:
            del t[3]

    doc = {"generatedAt": stats.get("generatedAt"), "window": {k: window[k] for k in ("firstMonth", "lastMonth", "monthCount")},
           "params": {"minStopRuns": MIN_STOP_RUNS, "lateMinutes": late},
           "stations": used, "foreign": foreign_names, "trains": trains}
    out = Path(args.out)
    payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
    if not out.exists() or out.read_text() != payload:
        out.write_text(payload)
        log(f"wrote {out}: {len(trains)} trains, {len(used)} stations, {len(payload) / 1e6:.2f} MB")
    else:
        log(f"{out} unchanged")


if __name__ == "__main__":
    main()
