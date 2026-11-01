#!/usr/bin/env python3
"""Compute the site data from the piebro/deutsche-bahn-data monthly Parquet files.

Writes data/stats.json, data/monthly.json, data/stations.json, data/trains/<slug>.json and
data/lines/<slug>.json (shapes in lib/types.ts). A run is one ride of one train; its delay is the
arrival delay at the last non-cancelled stop with a planned arrival (as in the reference query year.py).
Long-distance trains are ranked per train number, regional trains per line ("RE 19").

  python scripts/compute.py                       # download the latest months from Hugging Face, then compute
  python scripts/compute.py --data-dir DIR        # read local data-YYYY-MM.parquet files
  python scripts/compute.py --check-window        # print changed=true|false, compute nothing
"""
import argparse
import csv
import json
import os
import re
import sys
import tempfile
import time
import unicodedata
import urllib.request
import zlib
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import duckdb

HF_TREE = "https://huggingface.co/api/datasets/piebro/deutsche-bahn-data/tree/main/monthly_processed_data"
HF_FILE = "https://huggingface.co/datasets/piebro/deutsche-bahn-data/resolve/main/monthly_processed_data/data-{}.parquet"
STATIONS_CSV = "https://raw.githubusercontent.com/trainline-eu/stations/master/stations.csv"
FILE_RE = re.compile(r"(?:^|/)data-(\d{4}-\d{2})\.parquet$")
PUBLISHED_MONTHS = 12

PARAMS = {
    "longDistanceTypes": ["ICE", "IC", "EC", "ECE", "RJ", "RJX", "FLX", "TGV", "WB"],
    "nightTrainTypes": ["NJ", "EN"],
    "regionalLinePrefixes": ["RE", "RB", "IRE", "MEX", "RS", "FEX"],
    "minRunsForPool": 100,
    "minRunsForLinePool": 1000,
    "clampMinMinutes": -10,
    "clampMaxMinutes": 600,
    "minScheduledMinutesForPct": 15,
    "minStationsForFullMonth": 1000,
    "minStationArrivals": 500,
    "bigStationMinArrivals": 50000,
    "headlineMonths": 3,
    "topN": 10,
    "moreN": 25,
    "searchMinRuns": 20,
    "searchFewRuns": 100,
    "searchMinWeekdayRuns": 8,
    # Latest months per search record ([month, measured runs, avg]): 3 for long-distance trains (1.7k records), 1 for
    # regional lines and train numbers (32k records; 3 would add a third to every search shard). The card shows the
    # latest one, as the train page does (LATEST_MONTH_MIN_RUNS in lib/searchCore.ts).
    "searchRecentMonths": 3,
    "searchRecentMonthsRegional": 1,
    "lateMinutes": 15,
}
# Long-distance trains are known by their number, regional trains by their line.
CATEGORIES = {
    "longDistance": {"dir": "trains", "min_runs": "minRunsForPool"},
    "regional": {"dir": "lines", "min_runs": "minRunsForLinePool"},
}
HIST_BINS = [("<0", None, 0), ("0-5", 0, 5), ("5-15", 5, 15), ("15-30", 15, 30),
             ("30-60", 30, 60), ("60-120", 60, 120), ("120+", 120, None)]
BAND_BINS = [("under 6", None, 6), ("6-15", 6, 15), ("15-60", 15, 60), ("60+", 60, None)]

RUN_KEY = r"hash(regexp_extract(id, '^(.*-\d{10})-\d+$', 1))"
LINE_NAME = r"regexp_replace(line_number, '^([A-Z]+)\s*', '\1 ')"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def sql_list(items):
    return "[" + ", ".join(sql_str(i) for i in items) + "]"


def sql_in(items):
    return "(" + ", ".join(sql_str(i) for i in items) + ")"


def rnd(x, digits=1):
    if x is None:
        return None
    q = Decimal(repr(float(x))).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return float(q) + 0.0  # + 0.0 turns -0.0 into 0.0


def slugify(text):
    text = text.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def rows(con, sql, params=None):
    cur = con.execute(sql, params or [])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def bin_index(lower_bounds, col="delay"):
    """SQL for the bin index: the number of bin lower bounds at or below `col`."""
    return " + ".join(f"({col} >= {lo})::int" for _, lo, _ in lower_bounds if lo is not None)


# ---------------------------------------------------------------- listing, download and window

def list_remote():
    """[(month, bytes, url)] of every published monthly file, ascending."""
    url, entries = HF_TREE, []
    while url:
        with urllib.request.urlopen(url, timeout=60) as resp:
            entries += json.load(resp)
            m = re.search(r'<([^>]+)>;\s*rel="next"', resp.headers.get("Link") or "")
            url = m.group(1) if m else None
    out = []
    for e in entries:
        m = FILE_RE.search(e.get("path", ""))
        if e.get("type") == "file" and m:
            out.append((m.group(1), int(e["size"]), HF_FILE.format(m.group(1))))
    return sorted(out)


def list_local(data_dir):
    out = []
    for p in Path(data_dir).iterdir():
        m = FILE_RE.search(p.name)
        if m:
            out.append((m.group(1), p.stat().st_size, str(p)))
    return sorted(out)


def download(url, path, size=None):
    """Fetch url to path unless a file of the expected size is already there."""
    if path.exists() and (size is None or path.stat().st_size == size):
        return
    t0 = time.time()
    tmp = path.with_name(path.name + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "db-delay-leaderboard"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as f:
        while chunk := resp.read(1 << 20):
            f.write(chunk)
    os.replace(tmp, path)
    log(f"downloaded {path.name} ({path.stat().st_size / 1e6:.0f} MB) in {time.time() - t0:.0f}s")


def fetch_remote(cache_dir, until=None):
    """Download the latest published months (up to `until`, YYYY-MM) and the stations file; return (listing, stations_csv)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    remote = [r for r in list_remote() if until is None or r[0] <= until]
    for month, size, url in remote[-PUBLISHED_MONTHS:]:
        download(url, cache_dir / f"data-{month}.parquet", size)
    stations = cache_dir / "stations.csv"
    download(STATIONS_CSV, stations)
    local = {m: (b, str(cache_dir / f"data-{m}.parquet")) for m, b, _ in remote[-PUBLISHED_MONTHS:]}
    return [(m, b, local[m][1]) for m, b, _ in remote if m in local], str(stations)


def published_of(listing):
    return [{"month": m, "bytes": b} for m, b, _ in listing[-PUBLISHED_MONTHS:]]


def check_window(out_dir):
    published = published_of(list_remote())
    try:
        current = json.loads((out_dir / "stats.json").read_text())["window"]["published"]
    except (OSError, ValueError, KeyError):
        current = None
    line = f"changed={'true' if published != current else 'false'}"
    print(line)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write(line + "\n")


def choose_window(con, listing):
    """Keep the latest published months that have full station coverage."""
    months, sources, skipped = [], [], []
    for month, _, src in listing[-PUBLISHED_MONTHS:]:
        stations = con.execute(f"select count(distinct eva) from read_parquet({sql_str(src)})").fetchone()[0]
        log(f"{month}: {stations} stations")
        if stations < PARAMS["minStationsForFullMonth"]:
            skipped.append({"month": month,
                            "reason": f"partial month: {stations} stations, need {PARAMS['minStationsForFullMonth']}",
                            "stations": stations})
        else:
            months.append(month)
            sources.append(src)
    if not months:
        sys.exit("no month with full station coverage")
    window = {"firstMonth": months[0], "lastMonth": months[-1], "monthCount": len(months), "months": months,
              "skipped": skipped, "published": published_of(listing)}
    return window, sources


# ---------------------------------------------------------------- tables

def in_scope(p):
    """Parquet rows the site covers: long-distance trains and regional lines, no buses or replacement trains."""
    return f"""not is_replacement_train and (train_type in {sql_in(p['longDistanceTypes'])}
      or (train_type <> 'Bus'
          and regexp_extract(coalesce(line_number, ''), '^([A-Z]+)[0-9]', 1) in {sql_in(p['regionalLinePrefixes'])}))"""


def build_runs(con, sources, p):
    """One row per run, aggregated straight from the Parquet files (stop rows are never materialised)."""
    t0 = time.time()
    con.execute(f"""
    create table runs as
    select run, cat, any_value(tt) tt, any_value(num) num, any_value(line) line,
      arg_min(station_name, seq) origin, arg_max(dest, seq) dest,
      min(coalesce(dep_plan, arr_plan)) start_plan, min(dep_plan) first_dep,
      bool_and(canc) all_canc, bool_or(canc) any_canc,
      arg_max({{'delay': arr_delay, 'plan': arr_plan}}, seq)
        filter (where not canc and arr_plan is not null and arr_delay is not null) fin,
      list(eva order by seq) filter (where eva is not null) evas
    from (
      select {RUN_KEY} run,
        case when train_type in {sql_in(p['longDistanceTypes'])} then 'longDistance' else 'regional' end cat,
        train_type tt, train_number num, {LINE_NAME} line, train_line_station_num seq,
        try_cast(eva as integer) eva, station_name, final_destination_station dest,
        arrival_is_canceled or departure_is_canceled canc,
        arrival_planned_time arr_plan, departure_planned_time dep_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) arr_delay
      from read_parquet({sql_list(sources)})
      where {in_scope(p)})
    group by run, cat
    """)
    log(f"runs: {con.execute('select count(*) from runs').fetchone()[0]} in {time.time() - t0:.1f}s")


def line_components(con, tmp_dir):
    """Label each regional (line, station) with its line's connected component.

    Line codes repeat across regions (RE 19 is Düsseldorf-Arnhem and also Dresden-Hof), so a line is a
    code plus the set of stations its runs connect. The label is the smallest station number in the set.
    """
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for line, evas in con.execute("select distinct line, evas from runs where cat = 'regional' and len(evas) > 0").fetchall():
        a = find((line, evas[0]))
        for e in evas[1:]:
            b = find((line, e))
            if a != b:
                parent[b] = a
    label = {}
    for node in parent:
        root = find(node)
        label[root] = min(label.get(root, node[1]), node[1])
    path = Path(tmp_dir) / "line-nodes.csv"
    with open(path, "w", newline="") as f:
        csv.writer(f).writerows((line, eva, label[find((line, eva))]) for line, eva in parent)
    con.execute(f"""create table nodes as select * from read_csv({sql_str(path)}, header = false,
                    columns = {{'line': 'VARCHAR', 'eva': 'INTEGER', 'comp': 'INTEGER'}})""")
    log(f"lines: {con.execute('select count(distinct line), count(distinct (line, comp)) from nodes').fetchone()} codes, lines")


def build_window_runs(con, months, p):
    in_clamp = f"delay between {p['clampMinMinutes']} and {p['clampMaxMinutes']}"
    # A run belongs to the month of its scheduled first departure; runs leaking in from
    # neighbouring months (trains crossing midnight on the 1st) are left out.
    con.execute(f"""
    create table r as
    with w as (
      select runs.* exclude (evas), evas[1] first_eva, evas[-1] last_eva,
        strftime(start_plan, '%Y-%m') AS month, fin.delay delay, date_diff('minute', first_dep, fin.plan) sched_min,
        case when cat = 'longDistance' then tt || ' ' || num else runs.line || '#' || nodes.comp end unit
      from runs left join nodes on runs.cat = 'regional' and nodes.line = runs.line and nodes.eva = runs.evas[1]
      where strftime(start_plan, '%Y-%m') in (select unnest({sql_list(months)})))
    select *, coalesce({in_clamp}, false) valid,
      case when {in_clamp} and sched_min >= {p['minScheduledMinutesForPct']} then 100.0 * delay / sched_min end pct
    from w where unit is not null
    """)
    total, kept = con.execute("select (select count(*) from runs), (select count(*) from r)").fetchone()
    log(f"runs: {kept} in window months, {total - kept} outside left out")
    con.execute("drop table runs")


def build_stations(con, sources, months, p, stations_csv):
    """Arrival stats per station and the most common name of every station."""
    t0 = time.time()
    con.execute(f"""
    create table st as
    select eva, mode(station_name) name, count(*) filter (where ok) n, avg(d) filter (where ok) avg
    from (
      select eva, station_name, d, d between {p['clampMinMinutes']} and {p['clampMaxMinutes']} and not canc
        and strftime(arr_plan, '%Y-%m') in (select unnest({sql_list(months)})) ok
      from (
        select try_cast(eva as integer) eva, station_name, arrival_is_canceled canc, arrival_planned_time arr_plan,
          date_diff('minute', arrival_planned_time, arrival_change_time) d
        from read_parquet({sql_list(sources)})
        where {in_scope(p)}))
    where eva is not null
    group by eva
    """)
    # Several Trainline rows can share a db_id; prefer one with coordinates, then the main station, then the lowest id.
    con.execute(f"""
    create table coords as
    select try_cast(db_id as integer) eva, lat, lon from (
      select db_id, try_cast(latitude as double) lat, try_cast(longitude as double) lon,
        row_number() over (partition by db_id order by try_cast(latitude as double) is null,
          is_main_station = 't' desc, try_cast(id as bigint), id) rn
      from read_csv({sql_str(stations_csv)}, delim = ';', header = true, all_varchar = true, quote = '"')
      where coalesce(db_id, '') <> '')
    where rn = 1
    """)
    log(f"stations: {con.execute('select count(*) from st').fetchone()[0]} in {time.time() - t0:.1f}s")


# ---------------------------------------------------------------- aggregates

AGG = """
  count(*) runs,
  count(*) filter (where valid) measured,
  count(delay) - count(*) filter (where valid) dropped,
  avg(delay) filter (where valid) avg_min,
  median(delay) filter (where valid) med_min,
  avg(pct) avg_pct,
  100 * avg(all_canc::int) full_canc,
  avg(delay) avg_unclamped
"""


def overall_and_monthly(con, months, pool_sizes):
    overall = {}
    for o in rows(con, f"select cat, {AGG}, count(distinct unit) units from r group by cat"):
        overall[o["cat"]] = {"runs": o["runs"], "measuredRuns": o["measured"], "droppedByClamp": o["dropped"],
                             "avgDelayMin": rnd(o["avg_min"]), "medianDelayMin": rnd(o["med_min"]),
                             "avgDelayPct": rnd(o["avg_pct"]), "fullCancelPct": rnd(o["full_canc"]),
                             "units": o["units"], "poolSize": pool_sizes[o["cat"]]}
    by_month = {(m["cat"], m["month"]): m for m in rows(con, f"select cat, month, {AGG} from r group by cat, month")}
    series = {}
    for cat in CATEGORIES:
        series[cat] = []
        for month in months:
            m = by_month[(cat, month)]
            series[cat].append({"month": month, "runs": m["runs"], "measured": m["measured"],
                                "avgDelayMin": rnd(m["avg_min"]), "medianDelayMin": rnd(m["med_min"]),
                                "avgDelayPct": rnd(m["avg_pct"]), "fullCancelPct": rnd(m["full_canc"]),
                                "avgDelayMinUnclamped": rnd(m["avg_unclamped"]), "droppedByClamp": m["dropped"]})
    return overall, series


def headline(con, months, p):
    """What a typical trip looked like in the last few months of the window, per category."""
    recent = months[-p["headlineMonths"]:]
    out = {"months": recent, "categories": {}}
    bands = ", ".join(f"count(*) filter (where valid and band = {i}) b{i}" for i in range(len(BAND_BINS)))
    for h in rows(con, f"""
        select cat, count(*) runs, count(*) filter (where valid) measured,
          avg(delay) filter (where valid) avg_min, avg(pct) avg_pct, 100 * avg(all_canc::int) full_canc, {bands}
        from (select *, {bin_index(BAND_BINS)} band from r where month in (select unnest({sql_list(recent)})))
        group by cat"""):
        counts = [h[f"b{i}"] for i in range(len(BAND_BINS))]
        out["categories"][h["cat"]] = {
            "runs": h["runs"], "measured": h["measured"], "avgDelayMin": rnd(h["avg_min"]),
            "avgDelayPct": rnd(h["avg_pct"]), "fullCancelPct": rnd(h["full_canc"]),
            "bands": [{"label": label, "lo": lo, "hi": hi, "count": n, "share": rnd(100 * n / h["measured"])}
                      for (label, lo, hi), n in zip(BAND_BINS, counts)],
        }
    return out


def pool_stats(con, p):
    """Per-unit stats for every train or line with enough measured runs."""
    thresholds = " ".join(f"when {sql_str(c)} then {p[spec['min_runs']]}" for c, spec in CATEGORIES.items())
    return rows(con, f"""
    with train_routes as (
      select o.unit, o.origin, d.dest from
        (select unit, origin, row_number() over (partition by unit order by count(*) desc, origin) rn
         from r where cat = 'longDistance' and origin is not null group by unit, origin) o
      join
        (select unit, dest, row_number() over (partition by unit order by count(*) desc, dest) rn
         from r where cat = 'longDistance' and dest is not null group by unit, dest) d
      on o.unit = d.unit and o.rn = 1 and d.rn = 1
    ),
    -- A line runs both ways: take its most common pair of end stations, in the direction it ran more often.
    line_routes as (
      select unit, case when n_ab * 2 >= n then a else b end o_eva, case when n_ab * 2 >= n then b else a end d_eva
      from (
        select unit, least(first_eva, last_eva) a, greatest(first_eva, last_eva) b, count(*) n,
          count(*) filter (where first_eva <= last_eva) n_ab,
          row_number() over (partition by unit order by count(*) desc, a, b) rn
        from r where cat = 'regional' and first_eva is not null group by unit, a, b)
      where rn = 1
    ),
    routes as (
      select unit, origin, dest from train_routes
      union all
      select unit, o.name, d.name from line_routes join st o on o.eva = o_eva join st d on d.eva = d_eva
    )
    select s.*, routes.origin, routes.dest from (
      select cat, unit, any_value(tt) type, any_value(num) number, any_value(line) line, count(*) runs,
        count(*) filter (where valid) measured, count(pct) measured_pct,
        avg(delay) filter (where valid) m_avg, stddev_samp(delay) filter (where valid) m_sd,
        median(delay) filter (where valid) m_med, quantile_cont(delay, 0.9) filter (where valid) m_p90,
        avg(pct) p_avg, stddev_samp(pct) p_sd, median(pct) p_med, quantile_cont(pct, 0.9) p_p90,
        avg(sched_min) filter (where pct is not null) sched,
        100 * avg(all_canc::int) full_canc, 100 * avg(any_canc::int) any_canc,
        count(distinct case when cat = 'longDistance' then origin || ' → ' || dest
                            else least(first_eva, last_eva)::varchar || '-' || greatest(first_eva, last_eva)::varchar
                            end) variants,
        md5(string_agg(strftime(start_plan, '%Y-%m-%dT%H:%M') || '|' || coalesce(origin, '') || '|' || coalesce(dest, ''), ';'
          order by start_plan, origin, dest) filter (where cat = 'longDistance')) sig
      from r group by cat, unit
      having count(*) filter (where valid) >= case cat {thresholds} end
    ) s left join routes using (unit)
    """)


def collapse_aliases(pool):
    """One entry per physical train.

    Coupled or through-running portions show up under several numbers with the same runs (same
    planned start times and routes; recorded delays can differ by a minute). Keep the shortest
    number (IC 417 over EN 40417), then type and number as tie-breakers, and list the rest as aliases.
    Lines are not merged.
    """
    groups = {}
    for t in pool:
        key = t["sig"] if t["cat"] == "longDistance" else t["unit"]
        groups.setdefault(key, []).append(t)
    out = []
    for members in groups.values():
        members.sort(key=lambda t: (len(str(t["number"])), t["type"], str(t["number"])))
        out.append({**members[0], "aliases": [m["unit"] for m in members[1:]]})
    return sorted(out, key=lambda t: t["unit"])


def describe(t):
    """Display name, type code and slug of a pool unit."""
    if t["cat"] == "longDistance":
        return t["unit"], t["type"], slugify(t["unit"])
    return t["line"], t["line"].split(" ")[0], slugify(f"{t['line']} {t['origin']} {t['dest']}")


def summary(t, rank_min, rank_pct):
    name, kind, slug = describe(t)
    return {
        "slug": slug, "category": t["cat"], "name": name, "type": kind, "alsoRunsAs": t["aliases"],
        "origin": t["origin"], "dest": t["dest"], "routeVariants": t["variants"], "runs": t["runs"],
        "measured": t["measured"], "measuredPct": t["measured_pct"],
        "minutes": {"avg": rnd(t["m_avg"]), "sd": rnd(t["m_sd"]), "median": rnd(t["m_med"]), "p90": rnd(t["m_p90"])},
        "percent": {"avg": rnd(t["p_avg"]), "sd": rnd(t["p_sd"]), "median": rnd(t["p_med"]), "p90": rnd(t["p_p90"])},
        "avgScheduledMin": rnd(t["sched"]), "fullCancelPct": rnd(t["full_canc"]),
        "partialCancelPct": rnd(t["any_canc"]),
        "rank": {"minutes": rank_min, "percent": rank_pct},
    }


def build_detail_stops(con, sources, p):
    """Stop rows of the selected units' runs only (a second pass over the Parquet files)."""
    t0 = time.time()
    con.execute(f"""
    create table stops as
    select * from (
      select {RUN_KEY} run, train_line_station_num seq, try_cast(eva as integer) eva,
        arrival_is_canceled or departure_is_canceled canc, arrival_planned_time arr_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) arr_delay,
        date_diff('minute', departure_planned_time, departure_change_time) dep_delay
      from read_parquet({sql_list(sources)})
      where {in_scope(p)} and (train_type || ' ' || train_number in (select unit from sel)
                               or {LINE_NAME} in (select line from sel where line is not null)))
    where run in (select run from r join sel using (unit))
    """)
    log(f"detail stops: {con.execute('select count(*) from stops').fetchone()[0]} rows in {time.time() - t0:.1f}s")


def details(con, units, months, p):
    """Monthly series, histogram, stop sequence and worst run for each selected unit."""
    in_clamp = f"d between {p['clampMinMinutes']} and {p['clampMaxMinutes']}"
    in_sel = "unit in (select unit from sel)"
    out = {u: {"monthly": {}, "hist": [0] * len(HIST_BINS), "stops": [], "seq_runs": 0, "worst": None} for u in units}

    for m in rows(con, f"""select unit, month, count(*) n, avg(delay) avg from r
                           where valid and {in_sel} group by unit, month"""):
        out[m["unit"]]["monthly"][m["month"]] = m

    for h in rows(con, f"select unit, {bin_index(HIST_BINS)} bin, count(*) n from r where valid and {in_sel} group by all"):
        out[h["unit"]]["hist"][h["bin"]] = h["n"]

    # Deutsche Bahn's own rule counts a train as late from 6 minutes; the site shows it next to the 15-minute share.
    for h in rows(con, f"select unit, count(*) n, count(*) filter (where delay >= 6) l6 from r where valid and {in_sel} group by unit"):
        out[h["unit"]]["late6"] = rnd(100 * h["l6"] / h["n"]) if h["n"] else None

    for w in rows(con, f"""
        select unit, delay, start_plan::date::varchar AS date,
          case when cat = 'longDistance' then origin else o.name end origin,
          case when cat = 'longDistance' then dest else d.name end dest
        from (
          select *, row_number() over (partition by unit order by delay desc, start_plan, run) rn
          from r where valid and {in_sel}) x
        left join st o on o.eva = x.first_eva left join st d on d.eva = x.last_eva
        where rn = 1"""):
        out[w["unit"]]["worst"] = {"date": w["date"], "delayMin": w["delay"], "origin": w["origin"], "dest": w["dest"]}

    # Stop sequence: the most common exact sequence among runs of the unit's most common first->last stop pair.
    con.execute(f"""
    create or replace temp table seq_runs as
    with variant as (
      select unit, first_eva, last_eva from (
        select unit, first_eva, last_eva,
          row_number() over (partition by unit order by count(*) desc, first_eva, last_eva) rn
        from r where {in_sel} group by unit, first_eva, last_eva)
      where rn = 1),
    seqs as (
      select r.unit, r.run, list(s.eva order by s.seq) evas
      from r join variant v on r.unit = v.unit
        and r.first_eva is not distinct from v.first_eva and r.last_eva is not distinct from v.last_eva
      join stops s on s.run = r.run
      group by r.unit, r.run),
    best as (
      select unit, evas, n from (
        select unit, evas, count(*) n, row_number() over (partition by unit order by count(*) desc, evas) rn
        from seqs group by unit, evas)
      where rn = 1)
    select seqs.unit, seqs.run, best.n from seqs join best on seqs.unit = best.unit and seqs.evas = best.evas
    """)
    for s in rows(con, f"""
        select q.unit, q.pos, q.eva, any_value(q.n) seq_runs, st.name, coords.lat, coords.lon,
          avg(d) filter (where {in_clamp}) avg, count(d) filter (where {in_clamp}) n
        from (
          select sr.unit, sr.n, s.eva, row_number() over (partition by s.run order by s.seq) pos,
            case when not s.canc then (case when s.arr_plan is not null then s.arr_delay else s.dep_delay end) end d
          from seq_runs sr join stops s on s.run = sr.run) q
        left join st on st.eva = q.eva
        left join coords on coords.eva = q.eva
        group by q.unit, q.pos, q.eva, st.name, coords.lat, coords.lon
        order by q.unit, q.pos"""):
        d = out[s["unit"]]
        d["seq_runs"] = s["seq_runs"]
        d["stops"].append({"eva": str(s["eva"]), "name": s["name"], "lat": rnd(s["lat"], 5), "lon": rnd(s["lon"], 5),
                           "avgDelay": rnd(s["avg"]), "n": s["n"]})

    result = {}
    for u, d in out.items():
        measured = sum(d["hist"])
        result[u] = {
            "monthly": [{"month": m, "runs": d["monthly"][m]["n"] if m in d["monthly"] else 0,
                         "avg": rnd(d["monthly"][m]["avg"]) if m in d["monthly"] else None} for m in months],
            "histogram": [{"label": label, "lo": lo, "hi": hi, "count": n,
                           "share": rnd(100 * n / measured) if measured else 0.0}
                          for (label, lo, hi), n in zip(HIST_BINS, d["hist"])],
            "late6Pct": d.get("late6"),
            "stops": d["stops"],
            "stopsSequenceRuns": d["seq_runs"],
            "worstRun": d["worst"],
        }
    return result


def short_hash(*parts):
    """Four base-36 characters that tell apart units sharing a type and number (stable across runs)."""
    n, out = zlib.crc32("|".join(str(x) for x in parts).encode()) % 36 ** 4, ""
    for _ in range(4):
        n, d = divmod(n, 36)
        out = "0123456789abcdefghijklmnopqrstuvwxyz"[d] + out
    return out


# Search kinds: a long-distance train number, a regional line, a regional train number on a line.
SEARCH_KINDS = [(0, "cat = 'longDistance'", "unit"),
                (1, "cat = 'regional'", "unit"),
                (2, "cat = 'regional'", "unit || '/' || num")]


def search_units(con, p, page_slug, months):
    """Every train number, regional line and regional train number with enough measured runs, as records.

    page_slug maps a unit (or a train number merged into one) to the slug of its full page.
    Record layout (positional, see lib/searchCore.ts):
      [type, num, kind, runs, measured, avg, late, cancelled, weekday, origin, dest, worst, slug, hash, lineHash, line, late6,
       recent]
    recent: [[month, measured runs, avg delay], ...] for the last searchRecentMonths window months (searchRecentMonthsRegional
    for kinds 1 and 2) in which the unit has measured runs, oldest first; same numbers as the train page's monthly series.
    """
    in_clamp = f"delay between {p['clampMinMinutes']} and {p['clampMaxMinutes']}"
    min_runs, min_wd, late = p["searchMinRuns"], p["searchMinWeekdayRuns"], p["lateMinutes"]
    records = []
    for kind, cond, grp in SEARCH_KINDS:
        t0 = time.time()
        stats = {s["grp"]: s for s in rows(con, f"""
            select {grp} grp, any_value(unit) unit, any_value(tt) tt, any_value(num) num, any_value(line) line,
              count(*) runs, count(*) filter (where valid) measured,
              avg(delay) filter (where valid) avg_min,
              100.0 * count(*) filter (where valid and delay >= {late}) / nullif(count(*) filter (where valid), 0) late,
              100.0 * count(*) filter (where valid and delay >= 6) / nullif(count(*) filter (where valid), 0) late6,
              100 * avg(all_canc::int) full_canc
            from r where {cond} group by grp
            having count(*) filter (where valid) >= {min_runs}""")}
        weekday = {}
        for w in rows(con, f"""
            select {grp} grp, isodow(start_plan) - 1 wd, avg(delay) avg_min from r
            where valid and {cond} group by grp, wd having count(*) >= {min_wd}"""):
            weekday.setdefault(w["grp"], [None] * 7)[w["wd"]] = rnd(w["avg_min"])
        last = months[-(p["searchRecentMonths"] if kind == 0 else p["searchRecentMonthsRegional"]):]
        recent = {}
        for m in rows(con, f"""
            select {grp} grp, month, count(*) n, avg(delay) avg_min from r
            where valid and {cond} and month in (select unnest({sql_list(last)})) group by grp, month order by grp, month"""):
            recent.setdefault(m["grp"], []).append([m["month"], m["n"], rnd(m["avg_min"])])
        worst = {w["grp"]: w for w in rows(con, f"""
            select grp, delay, date, first_eva, last_eva, origin, dest from (
              select {grp} grp, delay, start_plan::date::varchar date, first_eva, last_eva, origin, dest,
                row_number() over (partition by {grp} order by delay desc, start_plan, run) rn
              from r where valid and {cond}) where rn = 1""") if w["grp"] in stats}
        if kind == 0:
            routes = {x["grp"]: (x["origin"], x["dest"]) for x in rows(con, f"""
                select o.unit grp, o.origin, d.dest from
                  (select unit, origin, row_number() over (partition by unit order by count(*) desc, origin) rn
                   from r where cat = 'longDistance' and origin is not null group by unit, origin) o
                  join
                  (select unit, dest, row_number() over (partition by unit order by count(*) desc, dest) rn
                   from r where cat = 'longDistance' and dest is not null group by unit, dest) d
                  on o.unit = d.unit and o.rn = 1 and d.rn = 1""")}
        else:
            # The most common pair of end stations, in the direction it ran more often.
            routes = {x["grp"]: (x["o"], x["d"]) for x in rows(con, f"""
                select grp, o.name o, d.name d from (
                  select grp, case when n_ab * 2 >= n then a else b end o_eva, case when n_ab * 2 >= n then b else a end d_eva
                  from (
                    select {grp} grp, least(first_eva, last_eva) a, greatest(first_eva, last_eva) b, count(*) n,
                      count(*) filter (where first_eva <= last_eva) n_ab,
                      row_number() over (partition by {grp} order by count(*) desc, a, b) rn
                    from r where {cond} and first_eva is not null group by grp, a, b)
                  where rn = 1) x
                join st o on o.eva = x.o_eva join st d on d.eva = x.d_eva""")}
        names = {}
        if kind != 0:
            names = {e["eva"]: e["name"] for e in rows(con, "select eva, name from st")}
        kind_records = []
        for g, s in stats.items():
            o, d = routes.get(g, (None, None))
            if o is None or d is None:
                continue
            w = worst[g]
            w_o = w["origin"] if kind == 0 else names.get(w["first_eva"])
            w_d = w["dest"] if kind == 0 else names.get(w["last_eva"])
            wr = [w["date"], w["delay"]] + ([w_o, w_d] if (w_o, w_d) != (o, d) and w_o and w_d else [])
            if kind == 0:
                typ, num, h = s["tt"], s["num"], None
            elif kind == 1:
                typ, num = s["line"].split(" ", 1)[0], s["line"].split(" ", 1)[1]
                h = short_hash(s["line"], o, d)
            else:
                typ, num, h = s["line"].split(" ", 1)[0], s["num"], short_hash(s["line"], s["num"], o, d)
            kind_records.append({"kind": kind, "unit": s["unit"], "group": g, "type": typ, "num": num, "hash": h,
                                 "line": s["line"] if kind == 2 else None,
                                 "late6": rnd(s["late6"]), "recent": recent.get(g, []),
                                 "rec": [typ, num, kind, s["runs"], s["measured"], rnd(s["avg_min"]), rnd(s["late"]),
                                         rnd(s["full_canc"]), weekday.get(g, [None] * 7), o, d, wr]})
        log(f"search kind {kind}: {len(kind_records)} of {len(stats)} units with >= {min_runs} measured runs in {time.time() - t0:.1f}s")
        records += kind_records

    # The raw destination column spells some stations differently ("Frankfurt(Main)Hbf"): use the commonest spelling.
    def key(name):
        return re.sub(r"[^a-z0-9]", "", name.lower())

    seen = {}
    for r_ in records:
        if r_["kind"] == 0:
            for name in [r_["rec"][9], r_["rec"][10]] + r_["rec"][11][2:]:
                seen.setdefault(key(name), {}).setdefault(name, 0)
                seen[key(name)][name] += 1
    best = {k: max(v.items(), key=lambda kv: (kv[1], kv[0]))[0] for k, v in seen.items()}
    for r_ in records:
        if r_["kind"] == 0:
            rec = r_["rec"]
            rec[9], rec[10] = best[key(rec[9])], best[key(rec[10])]
            if len(rec[11]) > 2:
                wo, wd = best[key(rec[11][2])], best[key(rec[11][3])]
                rec[11] = rec[11][:2] + ([wo, wd] if (wo, wd) != (rec[9], rec[10]) else [])

    # A train number's page: the unit's own slug, or the slug of the train it was merged into.
    line_hash = {r_["unit"]: r_["hash"] for r_ in records if r_["kind"] == 1}
    for r_ in records:
        rec = r_["rec"]
        # ... slug, hash, lineHash, line, late6 (Deutsche Bahn's 6-minute rule), recent. The tail stays padded so each
        # field keeps its place.
        rec += [page_slug.get(r_["unit"]) if r_["kind"] != 2 else None, r_["hash"],
                line_hash.get(r_["unit"]) if r_["kind"] == 2 else None, r_["line"], r_["late6"], r_["recent"]]
    return records


def search_shards(records):
    """Group records into shards keyed by the first two leading digits of the number."""
    shards = {}
    for r_ in records:
        digits = re.match(r"\d*", r_["num"]).group(0)
        shards.setdefault(digits[:2] or "_", []).append(r_)
    for key in shards:
        shards[key].sort(key=lambda x: (x["type"], x["num"].zfill(8), x["kind"], x["hash"] or ""))
    return shards


def search_files(records, window, p):
    """Files for data/search/: index.json, n-<type>.json (all numbers of a type, for typo suggestions), s-<key>.json."""
    shards = search_shards(records)
    nums = {}
    for r_ in records:
        nums.setdefault(r_["type"], set()).add(r_["num"])
    index = {"window": {k: window[k] for k in ("firstMonth", "lastMonth", "monthCount")},
             "params": {k: p[k] for k in ("searchMinRuns", "searchFewRuns", "searchMinWeekdayRuns", "lateMinutes",
                                         "searchRecentMonths", "searchRecentMonthsRegional")},
             "counts": {k: sum(1 for r_ in records if r_["kind"] == i) for i, k in enumerate(("train", "line", "regionalTrain"))},
             "shards": {k: len(v) for k, v in sorted(shards.items())}}
    index["types"] = {t: "longDistance" if any(r_["kind"] == 0 and r_["type"] == t for r_ in records) else "regional"
                      for t in sorted(nums)}
    files = {"index.json": index}
    for t, ns in sorted(nums.items()):
        files[f"n-{t}.json"] = {"nums": ",".join(sorted(ns, key=lambda n: (len(n), n)))}
    for key, recs in shards.items():
        files[f"s-{key}.json"] = [r_["rec"] for r_ in recs]
    return files


def recap_stats(con, p):
    """Numbers for the yearly recap card: whole-window shares and counts per category."""
    late = p["lateMinutes"]
    out = {}
    for c in rows(con, f"""
        select cat, count(*) runs, count(*) filter (where all_canc) cancelled, count(*) filter (where valid) measured,
          count(*) filter (where valid and delay >= {late}) late, count(*) filter (where valid and delay >= 60) late60,
          count(*) filter (where valid and delay >= 6) late6,
          avg(delay) filter (where valid) avg_min
        from r group by cat"""):
        out[c["cat"]] = {"runs": c["runs"], "cancelled": c["cancelled"], "measured": c["measured"],
                         "lateRuns": c["late"], "late60Runs": c["late60"], "late6Runs": c["late6"],
                         "latePct": rnd(100 * c["late"] / c["measured"]), "late60Pct": rnd(100 * c["late60"] / c["measured"]),
                         "late6Pct": rnd(100 * c["late6"] / c["measured"]),
                         "cancelledPct": rnd(100 * c["cancelled"] / c["runs"]), "avgDelayMin": rnd(c["avg_min"])}
    return out


def station_stats(con, p):
    return [{"name": s["name"], "lat": rnd(s["lat"], 4), "lon": rnd(s["lon"], 4), "n": s["n"], "avg": rnd(s["avg"])}
            for s in rows(con, f"""
    select st.name, coords.lat, coords.lon, st.n, st.avg from st join coords using (eva)
    where st.n >= {p['minStationArrivals']} and coords.lat is not null and coords.lon is not null
    order by st.name, st.eva""")]


# ---------------------------------------------------------------- output

def encode(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


def write_if_changed(path, payload, generated_at=None):
    """Rewrite only when the content (ignoring generatedAt) changed, so reruns leave git clean."""
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(old, dict):
            old.pop("generatedAt", None)
        if encode(old) == encode(payload):
            return False
    except (OSError, ValueError, AttributeError):
        pass
    doc = {"generatedAt": generated_at, **payload} if generated_at else payload
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(encode(doc), encoding="utf-8")
    os.replace(tmp, path)
    return True


def compute(args):
    out_dir = Path(args.out_dir)
    tmp = Path(tempfile.gettempdir()) / "db-delay-duckdb"
    tmp.mkdir(parents=True, exist_ok=True)
    if args.data_dir:
        listing = [x for x in list_local(args.data_dir) if args.until is None or x[0] <= args.until]
        stations_csv = args.stations_csv or STATIONS_CSV
        if re.match(r"https?://", stations_csv):
            download(stations_csv, tmp / "stations.csv")
            stations_csv = str(tmp / "stations.csv")
    else:
        listing, stations_csv = fetch_remote(Path(args.cache_dir), args.until)
    if not listing:
        sys.exit("no data-YYYY-MM.parquet files found")

    con = duckdb.connect()
    con.execute(f"set memory_limit = {sql_str(args.memory_limit)}; set temp_directory = {sql_str(tmp)};"
                " set preserve_insertion_order = false")
    window, sources = choose_window(con, listing)
    months = window["months"]
    log(f"window {window['firstMonth']}..{window['lastMonth']} ({window['monthCount']} months)")
    p = {**PARAMS, "clampMinMinutes": args.clamp_min, "clampMaxMinutes": args.clamp_max}

    build_runs(con, sources, p)
    line_components(con, tmp)
    build_window_runs(con, months, p)
    build_stations(con, sources, months, p, stations_csv)

    pool = collapse_aliases(pool_stats(con, p))
    top_n, more_n = p["topN"], p["moreN"]
    summaries, rankings, pool_sizes = {}, {}, {}
    for cat, spec in CATEGORIES.items():
        cat_pool = [t for t in pool if t["cat"] == cat]
        pool_sizes[cat] = len(cat_pool)
        by_min = sorted(cat_pool, key=lambda t: (-t["m_avg"], t["unit"]))[:more_n]
        # Some pool units have almost no runs long enough for % stats (EC 97: 2 of 325), so the
        # % ranking applies the run threshold to measuredPct as well.
        pct_pool = [t for t in cat_pool if t["measured_pct"] >= p[spec["min_runs"]]]
        by_pct = sorted(pct_pool, key=lambda t: (-t["p_avg"], t["unit"]))[:more_n]
        rank_min = {t["unit"]: i + 1 for i, t in enumerate(by_min)}
        rank_pct = {t["unit"]: i + 1 for i, t in enumerate(by_pct)}
        for t in by_min + by_pct:
            summaries[t["unit"]] = (t, summary(t, rank_min.get(t["unit"]), rank_pct.get(t["unit"])))
        rankings[cat] = {"minutes": [summaries[t["unit"]][1] for t in by_min],
                         "percent": [summaries[t["unit"]][1] for t in by_pct]}
        log(f"{cat}: pool {len(cat_pool)}, {len({t['unit'] for t in by_min + by_pct})} detail pages")

    units = sorted(summaries)
    con.execute("create or replace temp table sel as select * from (values " +
                ", ".join(f"({sql_str(u)}, {sql_str(t['line']) if t['cat'] == 'regional' else 'null::varchar'})"
                          for u, (t, _) in summaries.items()) + ") v(unit, line)")
    build_detail_stops(con, sources, p)
    det = details(con, units, months, p)

    page_slug = {}
    for u, (t, s) in summaries.items():
        page_slug[u] = s["slug"]
        for alias in t["aliases"]:
            page_slug[alias] = s["slug"]
    search = search_files(search_units(con, p, page_slug, months), window, p)

    overall, series = overall_and_monthly(con, months, pool_sizes)
    stats = {"window": window, "params": p, "headline": headline(con, months, p), "overall": overall,
             "recap": recap_stats(con, p), "rankings": rankings}
    monthly = {"window": window, "series": series}
    stations = {"stations": station_stats(con, p)}

    # Detail files first and stale ones last, so stats.json never names a slug whose file is missing.
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed, keep = [], {spec["dir"]: set() for spec in CATEGORIES.values()}
    for u in units:
        t, s = summaries[u]
        folder = CATEGORIES[t["cat"]]["dir"]
        (out_dir / folder).mkdir(parents=True, exist_ok=True)
        keep[folder].add(s["slug"])
        if write_if_changed(out_dir / folder / f"{s['slug']}.json", {**s, **det[u]}):
            changed.append(f"{folder}/{s['slug']}.json")
    for path, doc in [(out_dir / "stations.json", stations), (out_dir / "monthly.json", monthly),
                      (out_dir / "stats.json", stats)]:
        if write_if_changed(path, doc, generated_at):
            changed.append(path.name)
    for folder, slugs in keep.items():
        for stale in sorted((out_dir / folder).glob("*.json")):
            if stale.stem not in slugs:
                stale.unlink()
                changed.append(f"{folder}/{stale.name} (deleted)")
    (out_dir / "search").mkdir(parents=True, exist_ok=True)
    for name, doc in search.items():
        if write_if_changed(out_dir / "search" / name, doc, generated_at if name == "index.json" else None):
            changed.append(f"search/{name}")
    for stale in sorted((out_dir / "search").glob("*.json")):
        if stale.name not in search:
            stale.unlink()
            changed.append(f"search/{stale.name} (deleted)")
    log(f"{len(units)} detail files; changed: {len(changed)} files")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="read local data-YYYY-MM.parquet files instead of downloading them")
    ap.add_argument("--cache-dir", default=str(Path(tempfile.gettempdir()) / "db-delay-parquet"),
                    help="where downloaded files go and are reused from (default %(default)s)")
    ap.add_argument("--stations-csv", help="Trainline stations.csv path or URL (default: download it)")
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--memory-limit", default="4GB",
                    help="DuckDB memory limit; it spills to disk beyond this (default %(default)s)")
    ap.add_argument("--clamp-min", type=int, default=PARAMS["clampMinMinutes"],
                    help="drop runs whose final delay is below this many minutes (default %(default)s)")
    ap.add_argument("--clamp-max", type=int, default=PARAMS["clampMaxMinutes"],
                    help="drop runs whose final delay is above this many minutes (default %(default)s)")
    ap.add_argument("--until", help="ignore published months after this one (YYYY-MM); the monthly job passes the month it adds")
    ap.add_argument("--check-window", action="store_true",
                    help="only compare the live Hugging Face listing with the existing stats.json")
    args = ap.parse_args()
    if args.check_window:
        check_window(Path(args.out_dir))
    else:
        compute(args)


if __name__ == "__main__":
    main()
