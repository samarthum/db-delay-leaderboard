#!/usr/bin/env python3
"""Compute the leaderboard data from the piebro/deutsche-bahn-data monthly Parquet files.

Writes data/stats.json, data/monthly.json and data/trains/<slug>.json (shapes in lib/types.ts).
Run semantics follow the reference query year.py: a run is one ride of one train, its delay is the
arrival delay at the last non-cancelled stop with a planned arrival.

  python scripts/compute.py                       # read the latest months from Hugging Face
  python scripts/compute.py --data-dir DIR        # read local data-YYYY-MM.parquet files
  python scripts/compute.py --check-window        # print changed=true|false, compute nothing
"""
import argparse
import gzip
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

import duckdb

HF_TREE = "https://huggingface.co/api/datasets/piebro/deutsche-bahn-data/tree/main/monthly_processed_data"
HF_FILE = "https://huggingface.co/datasets/piebro/deutsche-bahn-data/resolve/main/monthly_processed_data/data-{}.parquet"
STATIONS_CSV = "https://raw.githubusercontent.com/trainline-eu/stations/master/stations.csv"
FILE_RE = re.compile(r"(?:^|/)data-(\d{4}-\d{2})\.parquet$")
PUBLISHED_MONTHS = 12
WORST_MONTH_MIN_RUNS = 10
MAX_CANCEL_BEST_BEHAVED = 5.0
WORST_RUN_MIN_STOPS = 3

PARAMS = {
    "trainTypes": ["ICE", "IC", "EC", "ECE", "RJ", "RJX", "NJ", "EN", "FLX", "TGV", "WB"],
    "minRunsForPool": 100,
    "clampMinMinutes": -10,
    "clampMaxMinutes": 600,
    "minScheduledMinutesForPct": 15,
    "minStationsForFullMonth": 1000,
    "minStationArrivals": 500,
    "lateThresholdMinutes": 15,
    "topN": 10,
    "moreN": 25,
}
HIST_BINS = [("<0", None, 0), ("0-5", 0, 5), ("5-15", 5, 15), ("15-30", 15, 30),
             ("30-60", 30, 60), ("60-120", 60, 120), ("120+", 120, None)]

RUN_ID = r"regexp_extract(id, '^(.*-\d{10})-\d+$', 1)"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def sql_list(items):
    return "[" + ", ".join(sql_str(i) for i in items) + "]"


def rnd(x, digits=1):
    if x is None:
        return None
    q = Decimal(repr(float(x))).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return float(q) + 0.0  # + 0.0 turns -0.0 into 0.0


def slugify(train):
    return re.sub(r"[^a-z0-9]+", "-", train.lower()).strip("-")


def rows(con, sql, params=None):
    cur = con.execute(sql, params or [])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


# ---------------------------------------------------------------- listing and window

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
    latest = listing[-PUBLISHED_MONTHS:]
    months, sources, skipped = [], [], []
    for month, _, src in latest:
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

def connect(remote=False):
    con = duckdb.connect()
    tmp = Path(tempfile.gettempdir()) / "db-delay-duckdb"
    con.execute(f"set memory_limit = '5GB'; set temp_directory = {sql_str(tmp)}; set preserve_insertion_order = false")
    if remote:
        load_httpfs(con, tmp)
    return con


def load_httpfs(con, tmp):
    try:
        con.execute("install httpfs; load httpfs")
    except duckdb.Error:
        # DuckDB fetches extensions over plain http, which some networks block, and it cannot use
        # https before httpfs itself is loaded. Fetch the same file over https and install it locally.
        version = con.execute("select library_version from pragma_version()").fetchone()[0]
        platform = con.execute("select platform from pragma_platform()").fetchone()[0]
        url = f"https://extensions.duckdb.org/{version}/{platform}/httpfs.duckdb_extension.gz"
        tmp.mkdir(parents=True, exist_ok=True)
        path = tmp / "httpfs.duckdb_extension"
        req = urllib.request.Request(url, headers={"User-Agent": "db-delay-leaderboard"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            path.write_bytes(gzip.decompress(resp.read()))
        con.execute(f"install {sql_str(path)}; load httpfs")


def build_tables(con, sources, months, stations_csv, p, pct_cap):
    types = "(" + ", ".join(sql_str(t) for t in PARAMS["trainTypes"]) + ")"
    t0 = time.time()
    # Only the columns we need, so remote reads fetch a fraction of each file.
    con.execute(f"""
    create table stops as
    select {RUN_ID} run_id, train_type tt, train_number num, train_line_station_num seq, eva, station_name,
      final_destination_station dest, arrival_is_canceled or departure_is_canceled canc,
      arrival_planned_time arr_plan, departure_planned_time dep_plan,
      date_diff('minute', arrival_planned_time, arrival_change_time) arr_delay,
      date_diff('minute', departure_planned_time, departure_change_time) dep_delay
    from read_parquet({sql_list(sources)})
    where train_type in {types} and not is_replacement_train
    """)
    log(f"stops: {con.execute('select count(*) from stops').fetchone()[0]} rows in {time.time() - t0:.1f}s")

    con.execute(f"""
    create table all_runs as
    with g as (
      select run_id, tt || ' ' || num train, tt, num,
        arg_min(station_name, seq) origin,
        arg_max(dest, seq) dest,
        min(coalesce(dep_plan, arr_plan)) start_plan,
        min(dep_plan) first_dep,
        bool_and(canc) all_canc,
        bool_or(canc) any_canc,
        arg_max({{'delay': arr_delay, 'plan': arr_plan}}, seq)
          filter (where not canc and arr_plan is not null and arr_delay is not null) fin
      from stops group by run_id, tt, num
    )
    select run_id, train, tt, num, origin, dest, start_plan, strftime(start_plan, '%Y-%m') AS month,
      all_canc, any_canc, fin.delay delay, date_diff('minute', first_dep, fin.plan) sched_min
    from g
    """)
    # A run belongs to the month of its scheduled first departure; runs leaking in from
    # neighbouring months (night trains crossing midnight on the 1st) are left out.
    in_clamp = f"delay between {p['clampMinMinutes']} and {p['clampMaxMinutes']}"
    pct = "100.0 * delay / sched_min" if pct_cap is None else f"least(100.0 * delay / sched_min, {float(pct_cap)})"
    con.execute(f"""
    create table r as
    select *, coalesce({in_clamp}, false) valid,
      case when {in_clamp} and sched_min >= {p['minScheduledMinutesForPct']} then {pct} end pct
    from all_runs where month in (select unnest({sql_list(months)}))
    """)
    total, kept = con.execute("select (select count(*) from all_runs), (select count(*) from r)").fetchone()
    log(f"runs: {kept} in window months, {total - kept} outside left out")

    con.execute("""
    create table names as
    select eva, station_name name from (
      select eva, station_name, row_number() over (partition by eva order by count(*) desc, station_name) rn
      from stops where station_name is not null group by eva, station_name)
    where rn = 1
    """)
    # Several Trainline rows can share a db_id; prefer one with coordinates, then the main station, then the lowest id.
    con.execute(f"""
    create table coords as
    select db_id, lat, lon from (
      select db_id, try_cast(latitude as double) lat, try_cast(longitude as double) lon,
        row_number() over (partition by db_id order by try_cast(latitude as double) is null,
          is_main_station = 't' desc, try_cast(id as bigint), id) rn
      from read_csv({sql_str(stations_csv)}, delim = ';', header = true, all_varchar = true, quote = '"')
      where coalesce(db_id, '') <> '')
    where rn = 1
    """)


# ---------------------------------------------------------------- aggregates

AGG = f"""
  count(*) runs,
  count(*) filter (where valid) measured,
  count(delay) - count(*) filter (where valid) dropped,
  avg(delay) filter (where valid) avg_min,
  median(delay) filter (where valid) med_min,
  avg(pct) avg_pct,
  100 * avg(all_canc::int) full_canc,
  avg(delay) avg_unclamped
"""


def overall_and_monthly(con, months, pool_size):
    o = rows(con, f"select {AGG}, count(distinct train) trains from r")[0]
    overall = {"runs": o["runs"], "measuredRuns": o["measured"], "droppedByClamp": o["dropped"],
               "avgDelayMin": rnd(o["avg_min"]), "medianDelayMin": rnd(o["med_min"]),
               "avgDelayPct": rnd(o["avg_pct"]), "fullCancelPct": rnd(o["full_canc"]),
               "trains": o["trains"], "poolSize": pool_size}
    by_month = {m["month"]: m for m in rows(con, f"select month, {AGG} from r group by month")}
    series = []
    for month in months:
        m = by_month[month]
        series.append({"month": month, "runs": m["runs"], "measured": m["measured"],
                       "avgDelayMin": rnd(m["avg_min"]), "medianDelayMin": rnd(m["med_min"]),
                       "avgDelayPct": rnd(m["avg_pct"]), "fullCancelPct": rnd(m["full_canc"]),
                       "avgDelayMinUnclamped": rnd(m["avg_unclamped"]), "droppedByClamp": m["dropped"]})
    return overall, series


def pool_stats(con):
    """Per-train stats for every train with enough measured runs."""
    return rows(con, f"""
    with routes as (
      select o.train, o.origin, d.dest from
        (select train, origin, row_number() over (partition by train order by count(*) desc, origin) rn
         from r where origin is not null group by train, origin) o
      join
        (select train, dest, row_number() over (partition by train order by count(*) desc, dest) rn
         from r where dest is not null group by train, dest) d
      on o.train = d.train and o.rn = 1 and d.rn = 1
    )
    select s.*, routes.origin, routes.dest from (
      select train, any_value(tt) type, any_value(num) number, count(*) runs,
        count(*) filter (where valid) measured, count(pct) measured_pct,
        avg(delay) filter (where valid) m_avg, stddev_samp(delay) filter (where valid) m_sd,
        median(delay) filter (where valid) m_med, quantile_cont(delay, 0.9) filter (where valid) m_p90,
        avg(pct) p_avg, stddev_samp(pct) p_sd, median(pct) p_med, quantile_cont(pct, 0.9) p_p90,
        avg(sched_min) filter (where pct is not null) sched,
        100 * avg(all_canc::int) full_canc, 100 * avg(any_canc::int) any_canc,
        count(distinct origin || ' → ' || dest) variants,
        md5(string_agg(strftime(start_plan, '%Y-%m-%dT%H:%M') || '|' || coalesce(origin, '') || '|' || coalesce(dest, ''), ';'
          order by start_plan, origin, dest)) sig
      from r group by train
      having count(*) filter (where valid) >= {PARAMS['minRunsForPool']}
    ) s left join routes using (train)
    """)


def collapse_aliases(pool):
    """One entry per physical train.

    Coupled or through-running portions show up under several numbers with the same runs (same
    planned start times and routes; recorded delays can differ by a minute). Keep the shortest
    number (IC 417 over EN 40417), then type and number as tie-breakers, and list the rest as aliases.
    """
    groups = {}
    for t in pool:
        groups.setdefault(t["sig"], []).append(t)
    out = []
    for members in groups.values():
        members.sort(key=lambda t: (len(str(t["number"])), t["type"], str(t["number"])))
        out.append({**members[0], "aliases": [m["train"] for m in members[1:]]})
    return sorted(out, key=lambda t: t["train"])


def summary(t, rank_min, rank_pct):
    return {
        "slug": slugify(t["train"]), "train": t["train"], "type": t["type"], "number": t["number"],
        "alsoRunsAs": t["aliases"],
        "origin": t["origin"], "dest": t["dest"], "routeVariants": t["variants"], "runs": t["runs"],
        "measured": t["measured"], "measuredPct": t["measured_pct"],
        "minutes": {"avg": rnd(t["m_avg"]), "sd": rnd(t["m_sd"]), "median": rnd(t["m_med"]), "p90": rnd(t["m_p90"])},
        "percent": {"avg": rnd(t["p_avg"]), "sd": rnd(t["p_sd"]), "median": rnd(t["p_med"]), "p90": rnd(t["p_p90"])},
        "avgScheduledMin": rnd(t["sched"]), "fullCancelPct": rnd(t["full_canc"]),
        "partialCancelPct": rnd(t["any_canc"]),
        "rank": {"minutes": rank_min, "percent": rank_pct},
    }


def details(con, trains, months, p):
    """Monthly series, histogram, stop sequence and worst run for each of `trains`."""
    in_clamp = f"d between {p['clampMinMinutes']} and {p['clampMaxMinutes']}"
    con.execute("create or replace temp table sel as select unnest(?::varchar[]) train", [trains])
    in_sel = "train in (select train from sel)"
    out = {t: {"monthly": {}, "hist": [0] * len(HIST_BINS), "stops": [], "seq_runs": 0, "worst": None} for t in trains}

    for m in rows(con, f"""select train, month, count(*) n, avg(delay) avg from r
                           where valid and {in_sel} group by train, month"""):
        out[m["train"]]["monthly"][m["month"]] = m

    # Bin index = number of bin lower bounds at or below the delay.
    bin_idx = " + ".join(f"(delay >= {lo})::int" for _, lo, _ in HIST_BINS if lo is not None)
    for h in rows(con, f"select train, {bin_idx} bin, count(*) n from r where valid and {in_sel} group by all"):
        out[h["train"]]["hist"][h["bin"]] = h["n"]

    for w in rows(con, f"""
        select train, delay, start_plan::date::varchar AS date, origin, dest from (
          select *, row_number() over (partition by train order by delay desc, start_plan, run_id) rn
          from r where valid and {in_sel})
        where rn = 1"""):
        out[w["train"]]["worst"] = {"date": w["date"], "delayMin": w["delay"], "origin": w["origin"], "dest": w["dest"]}

    # Stop sequence: the most common exact sequence among runs of the train's most common origin->dest pair.
    con.execute(f"""
    create or replace temp table seq_runs as
    with variant as (
      select train, origin, dest from (
        select train, origin, dest, row_number() over (partition by train order by count(*) desc, origin, dest) rn
        from r where {in_sel} group by train, origin, dest)
      where rn = 1),
    seqs as (
      select r.train, r.run_id, list(s.eva order by s.seq) evas
      from r join variant v on r.train = v.train
        and r.origin is not distinct from v.origin and r.dest is not distinct from v.dest
      join stops s on s.run_id = r.run_id
      group by r.train, r.run_id),
    best as (
      select train, evas, n from (
        select train, evas, count(*) n, row_number() over (partition by train order by count(*) desc, evas) rn
        from seqs group by train, evas)
      where rn = 1)
    select seqs.train, seqs.run_id, best.n from seqs join best on seqs.train = best.train and seqs.evas = best.evas
    """)
    for s in rows(con, f"""
        select q.train, q.pos, q.eva, any_value(q.n) seq_runs, names.name, coords.lat, coords.lon,
          avg(d) filter (where {in_clamp}) avg, count(d) filter (where {in_clamp}) n
        from (
          select sr.train, sr.n, st.eva, row_number() over (partition by st.run_id order by st.seq) pos,
            case when not st.canc then (case when st.arr_plan is not null then st.arr_delay else st.dep_delay end) end d
          from seq_runs sr join stops st on st.run_id = sr.run_id) q
        left join names on names.eva = q.eva
        left join coords on coords.db_id = ltrim(q.eva, '0')
        group by q.train, q.pos, q.eva, names.name, coords.lat, coords.lon
        order by q.train, q.pos"""):
        d = out[s["train"]]
        d["seq_runs"] = s["seq_runs"]
        d["stops"].append({"eva": s["eva"], "name": s["name"], "lat": rnd(s["lat"], 5), "lon": rnd(s["lon"], 5),
                           "avgDelay": rnd(s["avg"]), "n": s["n"]})

    result = {}
    for t, d in out.items():
        measured = sum(d["hist"])
        result[t] = {
            "monthly": [{"month": m, "runs": d["monthly"][m]["n"] if m in d["monthly"] else 0,
                         "avg": rnd(d["monthly"][m]["avg"]) if m in d["monthly"] else None} for m in months],
            "histogram": [{"label": label, "lo": lo, "hi": hi, "count": n,
                           "share": rnd(100 * n / measured) if measured else 0.0}
                          for (label, lo, hi), n in zip(HIST_BINS, d["hist"])],
            "stops": d["stops"],
            "stopsSequenceRuns": d["seq_runs"],
            "worstRun": d["worst"],
            "_monthly_raw": d["monthly"],
        }
    return result


def station_stats(con, p):
    return [{"name": s["name"], "lat": rnd(s["lat"], 5), "lon": rnd(s["lon"], 5), "n": s["n"],
             "avg": rnd(s["avg"]), "late": rnd(s["late"])}
            for s in rows(con, f"""
    with a as (
      select eva, count(*) n, avg(arr_delay) avg, 100 * avg((arr_delay >= {p['lateThresholdMinutes']})::int) late
      from stops
      where run_id in (select run_id from r) and not canc and arr_plan is not null
        and arr_delay between {p['clampMinMinutes']} and {p['clampMaxMinutes']}
      group by eva having count(*) >= {p['minStationArrivals']})
    select names.name, coords.lat, coords.lon, a.n, a.avg, a.late
    from a join names using (eva) join coords on coords.db_id = ltrim(a.eva, '0')
    where coords.lat is not null and coords.lon is not null
    order by names.name, a.eva""")]


def extra_train(t):
    return {"slug": slugify(t["train"]), "train": t["train"], "origin": t["origin"], "dest": t["dest"],
            "measured": t["measured"], "avgMin": rnd(t["m_avg"]), "fullCancelPct": rnd(t["full_canc"])}


def worst_run_overall(con, detail_slugs):
    # origin == dest or a one-stop run is a data artefact, not a journey worth naming.
    w = rows(con, f"""select r.train, delay, start_plan::date::varchar AS date, origin, dest from r
                      join (select run_id, count(*) n from stops group by run_id) k using (run_id)
                      where valid and origin is not null and dest is not null and origin <> dest
                        and k.n >= {WORST_RUN_MIN_STOPS} and regexp_matches(r.train, '^[A-Z]+ [0-9]+$')
                      order by delay desc, start_plan, r.run_id limit 1""")
    if not w:
        return None
    w = w[0]
    slug = slugify(w["train"])
    return {"date": w["date"], "delayMin": w["delay"], "origin": w["origin"], "dest": w["dest"],
            "slug": slug if slug in detail_slugs else None, "train": w["train"]}


# ---------------------------------------------------------------- output

def encode(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"


def write_if_changed(path, payload, generated_at=None):
    """Rewrite only when the content (ignoring generatedAt) changed, so reruns leave git clean."""
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
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
    listing = list_local(args.data_dir) if args.data_dir else list_remote()
    if not listing:
        sys.exit("no data-YYYY-MM.parquet files found")
    con = connect(remote=not args.data_dir or re.match(r"https?://", args.stations_csv) is not None)
    window, sources = choose_window(con, listing)
    log(f"window {window['firstMonth']}..{window['lastMonth']} ({window['monthCount']} months)")
    p = {**PARAMS, "clampMinMinutes": args.clamp_min, "clampMaxMinutes": args.clamp_max}
    build_tables(con, sources, window["months"], args.stations_csv, p, args.pct_cap)

    raw_pool = pool_stats(con)
    pool = collapse_aliases(raw_pool)
    log(f"pool {len(raw_pool)} train numbers -> {len(pool)} physical trains")
    top_n, more_n = PARAMS["topN"], PARAMS["moreN"]
    by_min = sorted(pool, key=lambda t: (-t["m_avg"], t["train"]))[:more_n]
    # Some pool trains have almost no runs long enough for % stats (EC 97: 2 of 325), so the
    # % ranking applies the run threshold to measuredPct as well.
    pct_pool = [t for t in pool if t["measured_pct"] >= PARAMS["minRunsForPool"]]
    by_pct = sorted(pct_pool, key=lambda t: (-t["p_avg"], t["train"]))[:more_n]
    rank_min = {t["train"]: i + 1 for i, t in enumerate(by_min)}
    rank_pct = {t["train"]: i + 1 for i, t in enumerate(by_pct)}
    summaries = {t["train"]: summary(t, rank_min.get(t["train"]), rank_pct.get(t["train"])) for t in by_min + by_pct}
    rankings = {"minutes": [summaries[t["train"]] for t in by_min], "percent": [summaries[t["train"]] for t in by_pct]}

    detail_trains = sorted(summaries)
    det = details(con, detail_trains, window["months"], p)
    detail_slugs = {slugify(t) for t in detail_trains}

    headline = sorted({t["train"] for t in by_min[:top_n] + by_pct[:top_n]})
    candidates = [(m["avg"], t, month, m["n"]) for t in headline for month, m in det[t]["_monthly_raw"].items()
                  if m["n"] >= WORST_MONTH_MIN_RUNS]
    worst_month = None
    if candidates:
        avg, train, month, n = sorted(candidates, key=lambda c: (-c[0], c[1], c[2]))[0]
        worst_month = {"slug": slugify(train), "train": train, "month": month, "avg": rnd(avg), "runs": n}

    extras = {
        "bestBehaved": extra_train(min((t for t in pool if t["full_canc"] < MAX_CANCEL_BEST_BEHAVED),
                                       key=lambda t: (t["m_avg"], t["train"]))),
        "mostCancelled": extra_train(min(pool, key=lambda t: (-t["full_canc"], t["train"]))),
        "worstTrainMonth": worst_month,
        "worstRun": worst_run_overall(con, detail_slugs),
    }
    overall, series = overall_and_monthly(con, window["months"], len(pool))
    stats = {"window": window, "params": p, "overall": overall, "rankings": rankings,
             "extras": extras, "stations": station_stats(con, p)}
    monthly = {"window": window, "months": series}

    # Train files first and stale ones last, so stats.json never names a slug whose file is missing.
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    trains_dir = out_dir / "trains"
    trains_dir.mkdir(parents=True, exist_ok=True)
    changed = []
    for train in detail_trains:
        d = {k: v for k, v in det[train].items() if not k.startswith("_")}
        if write_if_changed(trains_dir / f"{slugify(train)}.json", {**summaries[train], **d}):
            changed.append(f"trains/{slugify(train)}.json")
    for path, doc in [(out_dir / "monthly.json", monthly), (out_dir / "stats.json", stats)]:
        if write_if_changed(path, doc, generated_at):
            changed.append(path.name)
    for stale in sorted(trains_dir.glob("*.json")):
        if stale.stem not in detail_slugs:
            stale.unlink()
            changed.append(f"trains/{stale.name} (deleted)")
    log(f"pool {len(pool)} trains, {len(detail_trains)} detail files; changed: {', '.join(changed) or 'nothing'}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", help="read local data-YYYY-MM.parquet files instead of Hugging Face")
    ap.add_argument("--stations-csv", default=STATIONS_CSV, help="Trainline stations.csv path or URL")
    ap.add_argument("--out-dir", default="data")
    ap.add_argument("--clamp-min", type=int, default=PARAMS["clampMinMinutes"],
                    help="drop runs whose final delay is below this many minutes (default %(default)s)")
    ap.add_argument("--clamp-max", type=int, default=PARAMS["clampMaxMinutes"],
                    help="drop runs whose final delay is above this many minutes (default %(default)s)")
    ap.add_argument("--pct-cap", type=float, default=None,
                    help="winsorize each run's %% delay at this value before averaging (default: no cap; "
                         "not recorded in the JSON)")
    ap.add_argument("--check-window", action="store_true",
                    help="only compare the live Hugging Face listing with the existing stats.json")
    args = ap.parse_args()
    if args.check_window:
        check_window(Path(args.out_dir))
    else:
        compute(args)


if __name__ == "__main__":
    main()
