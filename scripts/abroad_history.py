#!/usr/bin/env python3
"""How late cross-border trains usually are at their stops ABROAD, from each country's own open data.

The site's history (piebro/deutsche-bahn-data) records stops inside Germany only. This adds, for the same months as
the site's window (data/stats.json) and with the same rules as scripts/stops.py, each train's figures at its stops in
the countries that publish per-train, per-stop delays:

  NL  Rijden de Treinen, "Train archive" (opendata.rijdendetreinen.nl/public/services/services-YYYY-MM.csv.gz):
      every service of the Dutch network with every stop, planned times and delays in minutes, incl. NS International's
      ICE Amsterdam - Frankfurt / Berlin. Licence CC BY 4.0 (Rijden de Treinen).
  BE  Infrabel, "Monthly raw punctuality data files" (opendata.infrabel.be, dataset stiptheid-gegevens-maandelijksebestanden):
      every passenger train at every measuring point, planned times and delays in seconds, incl. the ICE Frankfurt -
      Brussels. Licence CC0.

  python scripts/abroad_history.py --cache DIR            # downloads what is missing into DIR
  python scripts/abroad_history.py --cache DIR --check    # gate: window, coverage, size (the job runs it)

Rules, the same as stops.py (per stop of a train):
  run       one service (RdT service id), counted in the month of its service date; only window months
  measured  arrival not cancelled, with a planned arrival and a delay between clampMin and clampMax minutes
  late      measured and lateMinutes or more late
  avg       mean arrival delay of the measured runs
  cancelled share of the train's runs at that stop whose arrival or departure there was cancelled
  departure figures the same on the departure, used only where a stop has no planned arrival (the train starts there)
  figures need MIN_STOP_RUNS measured runs, else null ("few trips"), as on the German stops
Only runs that also call in Germany count (NS numbers some domestic Intercitys like DB's IC 2xxx), and only stations of
that country (RdT also lists the German stops of these trains; those come from DB's data).
Train names: RdT type + number ("ICE" 121 -> "ICE 121"); only numbers the site knows as long-distance trains are kept.

Writes data/abroad-history.json:
  {"window": {firstMonth, lastMonth, monthCount, months}, "params": {...},
   "sources": {"NL": {"name", "url", "licence", "months": [...]}},
   "trains": {"ICE 121": {"Utrecht Centraal": ["NL", runs, measured, late %, avg, depMeasured, depLate %, depAvg, cancelled %]}}}
Countries without a source are simply absent from "sources"; the site then says so at those stops.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
UA = "german-punctuality/1.0 (+https://german-punctuality.vercel.app)"
MIN_STOP_RUNS = 20  # as scripts/stops.py
RDT = "https://opendata.rijdendetreinen.nl/public"
# RdT service types -> the type DB uses for the same train.
NL_TYPES = {"ICE": "ICE", "EuroCity": "EC", "Intercity": "IC", "Eurocity Direct": "ECD", "Nightjet": "NJ"}
INFRABEL = "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/stiptheid-gegevens-maandelijksebestanden/records"
SOURCES = {
    "NL": {"name": "Rijden de Treinen", "url": "https://www.rijdendetreinen.nl/en/open-data", "licence": "CC BY 4.0"},
    "BE": {"name": "Infrabel", "url": "https://opendata.infrabel.be/explore/dataset/stiptheid-gegevens-maandelijksebestanden/", "licence": "CC0"},
}
# Infrabel names points in Dutch capitals; the site spells stations as the other sources do (lib/tripStops.cjs).
BE_NAMES = {"BRUSSEL-ZUID": "Bruxelles Midi", "BRUSSEL-NOORD": "Bruxelles Nord", "BRUSSEL-CENTRAAL": "Bruxelles Central",
            "LIEGE-GUILLEMINS": "Liège-Guillemins", "LEUVEN": "Leuven", "WELKENRAEDT": "Welkenraedt", "EUPEN": "Eupen",
            "VERVIERS-CENTRAL": "Verviers-Central", "ANTWERPEN-CENTRAAL": "Antwerpen Centraal", "MECHELEN": "Mechelen",
            "BRUSSELS AIRPORT - ZAVENTEM": "Brussels Airport"}
# Gate (--check)
MIN_TRAINS = {"NL": 20, "BE": 4}
MAX_LAG_MONTHS = 2
MAX_BYTES = 200_000


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def fetch(url, dest, missing_ok=False):
    """Download once into the cache. missing_ok: a 404 (a month the source has not published yet) returns None."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.rename(dest)
            log(f"downloaded {url} ({dest.stat().st_size / 1e6:.1f} MB)")
            return dest
        except urllib.error.HTTPError as e:
            if e.code == 404 and missing_ok:
                log(f"not published yet: {url}")
                return None
            log(f"retry {attempt + 1} {url}: {e}")
            time.sleep(10 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            log(f"retry {attempt + 1} {url}: {e}")
            time.sleep(10 * (attempt + 1))
    raise SystemExit(f"cannot download {url}")


def nl_stations(cache):
    """RdT station list (code -> country). The newest stations-YYYY-MM.csv in the folder listing."""
    cached = sorted(cache.glob("rdt-stations-*.csv"))
    try:
        req = urllib.request.Request(f"{RDT}/stations/", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            names = sorted(set(re.findall(r"stations-(\d{4}-\d{2})\.csv", r.read().decode("utf-8", "replace"))))
    except Exception as e:  # noqa: BLE001
        if not cached:
            raise
        log(f"station list: {e}; using {cached[-1].name}")
        return cached[-1]
    if not names:
        raise SystemExit("no RdT station list found")
    return fetch(f"{RDT}/stations/stations-{names[-1]}.csv", cache / f"rdt-stations-{names[-1]}.csv")


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def compute_nl(con, cache, window, wanted, p):
    """Returns (months used, rows). A window month RdT has not published yet is left out (and named in the file)."""
    got = [(m, fetch(f"{RDT}/services/services-{m}.csv.gz", cache / f"rdt-services-{m}.csv.gz", missing_ok=True)) for m in window]
    months = [m for m, f in got if f]
    files = [f for _, f in got if f]
    if not files:
        raise SystemExit("NL: no services file for the window")
    st = nl_stations(cache)
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    types = ", ".join(f"({sql_str(k)}, {sql_str(v)})" for k, v in NL_TYPES.items())
    con.execute(f"create or replace table nlst as select code, country from read_csv({sql_str(str(st))}, header=true, all_varchar=true)")
    con.execute("create or replace table want(name varchar)")
    con.executemany("insert into want values (?)", [(w,) for w in sorted(wanted)])
    src = "[" + ", ".join(sql_str(str(f)) for f in files) + "]"
    con.execute(f"""
    create or replace table nl as
    with raw as (
      select "Service:RDT-ID" run, "Service:Date" sdate, t.db || ' ' || "Service:Train number" train,
        "Stop:RDT-ID" sid, "Stop:Station code" code, "Stop:Station name" name,
        "Stop:Arrival time" arr_t, try_cast("Stop:Arrival delay" as integer) arr_d, "Stop:Arrival cancelled" = 'true' arr_c,
        "Stop:Departure time" dep_t, try_cast("Stop:Departure delay" as integer) dep_d, "Stop:Departure cancelled" = 'true' dep_c
      from read_csv({src}, header=true, all_varchar=true, compression='gzip')
      join (values {types}) t(rdt, db) on t.rdt = "Service:Type")
    select raw.* from raw join nlst using (code)
    where nlst.country = 'NL' and train in (select name from want)
      and strftime(cast(sdate as date), '%Y-%m') in (select unnest([{", ".join(sql_str(m) for m in months)}]))
      -- a cross-border run: it also calls in Germany (NS numbers its domestic Intercitys like DB's IC 2xxx)
      and run in (select r."Service:RDT-ID" from read_csv({src}, header=true, all_varchar=true, compression='gzip') r
                  join nlst g on g.code = r."Stop:Station code" where g.country = 'D')
    qualify row_number() over (partition by run, name order by try_cast(sid as bigint)) = 1
    """)
    rows = con.execute(f"""
    select train, name, count(*) runs,
      count(*) filter (where not coalesce(arr_c, false) and coalesce(arr_t, '') <> '' and arr_d between {lo} and {hi}) am,
      100.0 * count(*) filter (where not coalesce(arr_c, false) and coalesce(arr_t, '') <> '' and arr_d between {lo} and {hi} and arr_d >= {late})
        / nullif(count(*) filter (where not coalesce(arr_c, false) and coalesce(arr_t, '') <> '' and arr_d between {lo} and {hi}), 0) al,
      avg(arr_d) filter (where not coalesce(arr_c, false) and coalesce(arr_t, '') <> '' and arr_d between {lo} and {hi}) aa,
      count(*) filter (where not coalesce(dep_c, false) and coalesce(dep_t, '') <> '' and dep_d between {lo} and {hi}) dm,
      100.0 * count(*) filter (where not coalesce(dep_c, false) and coalesce(dep_t, '') <> '' and dep_d between {lo} and {hi} and dep_d >= {late})
        / nullif(count(*) filter (where not coalesce(dep_c, false) and coalesce(dep_t, '') <> '' and dep_d between {lo} and {hi}), 0) dl,
      avg(dep_d) filter (where not coalesce(dep_c, false) and coalesce(dep_t, '') <> '' and dep_d between {lo} and {hi}) da,
      100.0 * avg((coalesce(arr_c, false) or coalesce(dep_c, false))::int) canc,
      count(*) filter (where coalesce(arr_t, '') <> '') has_arr
    from nl group by train, name order by train, name
    """).fetchall()
    log(f"NL: {con.execute('select count(*) from nl').fetchone()[0]} stop rows, {len(rows)} train-stops, months {months[0]}..{months[-1]}")
    return months, rows


def be_files(cache, window):
    """Infrabel's monthly raw files for the window months it has published: [(month, path)]."""
    q = urllib.parse.urlencode({"limit": 100, "where": f'mois >= "{window[0]}" and mois <= "{window[-1]}"'})
    try:
        req = urllib.request.Request(f"{INFRABEL}?{q}", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            links = {x["mois"]: x["link_to_data"] for x in json.loads(r.read())["results"]}
    except Exception as e:  # noqa: BLE001
        cached = [(m, cache / f"infrabel-{m}.csv") for m in window if (cache / f"infrabel-{m}.csv").exists()]
        if not cached:
            raise
        log(f"BE file list: {e}; using {len(cached)} cached files")
        return cached
    out = []
    for m in window:
        if m in links:
            f = fetch(links[m], cache / f"infrabel-{m}.csv", missing_ok=True)
            if f:
                out.append((m, f))
        else:
            log(f"BE: {m} not published yet")
    return out


def compute_be(con, cache, window, wanted, p):
    """Belgium, Infrabel raw punctuality: one row per train and measuring point, delays in seconds.

    A stop is a point where the train is planned to wait (planned departure after planned arrival) or where it starts or
    ends; points it passes (planned arrival = departure: Leuven, Hergenrath at the border) are not stops. Delays become
    whole minutes, cut toward zero (59 s late counts as 0, 15:00 as 15; 30 s early as 0). Infrabel lists only trains that ran, so there is no
    cancelled share for Belgium (null). Only ICE (no domestic train has that type in Belgium).
    """
    got = be_files(cache, window)
    if not got:
        raise SystemExit("BE: no Infrabel file for the window")
    months = [m for m, _ in got]
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    con.execute("create or replace table bewant(name varchar)")
    con.executemany("insert into bewant values (?)", [(w,) for w in sorted(wanted)])
    names = ", ".join(f"({sql_str(k)}, {sql_str(v)})" for k, v in BE_NAMES.items())
    src = "[" + ", ".join(sql_str(str(f)) for _, f in got) + "]"
    con.execute(f"""
    create or replace table be as
    with raw as (
      select make_date(cast(substr(DATDEP, 6, 4) as integer),
          list_position(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'], upper(substr(DATDEP, 3, 3))),
          cast(substr(DATDEP, 1, 2) as integer)) sdate, 'ICE ' || TRAIN_NO train, PTCAR_LG_NM_NL pt,
        nullif(PLANNED_TIME_ARR, '') pa, nullif(PLANNED_TIME_DEP, '') pd,
        try_cast(DELAY_ARR as integer) da_s, try_cast(DELAY_DEP as integer) dd_s
      from read_csv({src}, header=true, all_varchar=true)
      where RELATION = 'ICE')
    select sdate, train, coalesce(n.site, pt) name, pa, pd,
      trunc(da_s / 60.0)::integer arr_d, trunc(dd_s / 60.0)::integer dep_d
    from raw left join (values {names}) n(inf, site) on n.inf = pt
    where train in (select name from bewant)
      and strftime(sdate, '%Y-%m') in (select unnest([{", ".join(sql_str(m) for m in months)}]))
      and (pa is null or pd is null or pd <> pa)
    """)
    rows = con.execute(f"""
    select train, name, count(*) runs,
      count(*) filter (where pa is not null and arr_d between {lo} and {hi}) am,
      100.0 * count(*) filter (where pa is not null and arr_d between {lo} and {hi} and arr_d >= {late})
        / nullif(count(*) filter (where pa is not null and arr_d between {lo} and {hi}), 0) al,
      avg(arr_d) filter (where pa is not null and arr_d between {lo} and {hi}) aa,
      count(*) filter (where pd is not null and dep_d between {lo} and {hi}) dm,
      100.0 * count(*) filter (where pd is not null and dep_d between {lo} and {hi} and dep_d >= {late})
        / nullif(count(*) filter (where pd is not null and dep_d between {lo} and {hi}), 0) dl,
      avg(dep_d) filter (where pd is not null and dep_d between {lo} and {hi}) da,
      null canc,
      count(*) filter (where pa is not null) has_arr
    from be group by train, name order by train, name
    """).fetchall()
    log(f"BE: {con.execute('select count(*) from be').fetchone()[0]} stop rows, {len(rows)} train-stops, months {months[0]}..{months[-1]}")
    return months, rows


def cell(cc, runs, am, al, aa, dm, dl, da, canc, has_arr):
    ok_a, ok_d = am >= MIN_STOP_RUNS, dm >= MIN_STOP_RUNS
    r1 = lambda x: None if x is None else round(x, 1)  # noqa: E731
    # Departure figures only where the train mostly starts at that stop (no planned arrival), as the German data has none.
    starts = has_arr * 2 < runs
    return [cc, runs, am, r1(al) if ok_a else None, r1(aa) if ok_a else None,
            dm if starts else 0, r1(dl) if starts and ok_d else None, r1(da) if starts and ok_d else None,
            None if canc is None else r1(canc)]


def check(path, stats):
    doc = json.loads(Path(path).read_text())
    w = json.loads(Path(stats).read_text())["window"]
    bad = []
    if doc["window"]["months"] != w["months"]:
        bad.append(f"window {doc['window']['months']} != site window {w['months']}")
    for cc, n in MIN_TRAINS.items():
        have = sum(1 for t in doc["trains"].values() if any(v[0] == cc for v in t.values()))
        if have < n:
            bad.append(f"{cc}: {have} trains, need {n}")
        if cc not in doc["sources"]:
            bad.append(f"{cc}: no source block")
            continue
        got = doc["sources"][cc]["months"]
        # A source may lag by a month or two (published later than DB's data); never months outside the window.
        if not set(got) <= set(w["months"]) or len(got) < len(w["months"]) - MAX_LAG_MONTHS or got != sorted(got):
            bad.append(f"{cc}: months {got} vs window {w['months']}")
    size = Path(path).stat().st_size
    if size > MAX_BYTES:
        bad.append(f"{size} bytes > {MAX_BYTES}")
    for b in bad:
        log("GATE " + b)
    log(f"abroad history: {len(doc['trains'])} trains, {sum(len(t) for t in doc['trains'].values())} stops, {size} bytes; "
        f"{'OK' if not bad else 'FAILED'}")
    return not bad


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stats", default=str(ROOT / "data/stats.json"))
    ap.add_argument("--stops", default=str(ROOT / "data/stops.json"), help="the site's long-distance train numbers")
    ap.add_argument("--cache", required=True)
    ap.add_argument("--out", default=str(ROOT / "data/abroad-history.json"))
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    if a.check:
        sys.exit(0 if check(a.out, a.stats) else 1)
    stats = json.loads(Path(a.stats).read_text())
    w, p = stats["window"], stats["params"]
    months = w["months"]
    stops = json.loads(Path(a.stops).read_text())
    wanted = {f"{t[0]} {t[1]}" for t in stops["trains"]}
    cache = Path(a.cache)
    con = duckdb.connect()
    con.execute("set memory_limit = '2GB'; set preserve_insertion_order = false")
    trains = {}
    used = {}
    for cc, compute in (("NL", compute_nl), ("BE", compute_be)):
        used[cc], rows = compute(con, cache, months, wanted, p)
        for train, name, *vals in rows:
            trains.setdefault(train, {})[name] = cell(cc, *vals)
    doc = {"window": {k: w[k] for k in ("firstMonth", "lastMonth", "monthCount", "months")},
           "params": {"minStopRuns": MIN_STOP_RUNS, "lateMinutes": p["lateMinutes"], "clampMinMinutes": p["clampMinMinutes"],
                      "clampMaxMinutes": p["clampMaxMinutes"]},
           "sources": {cc: {**s, "months": used[cc]} for cc, s in SOURCES.items() if cc in used},
           "trains": {k: dict(sorted(v.items())) for k, v in sorted(trains.items())}}
    Path(a.out).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    log(f"wrote {a.out}: {len(trains)} trains, {sum(len(v) for v in trains.values())} stops abroad")


if __name__ == "__main__":
    main()
