"""Timetable for live lookups of single trains: for every long-distance train number in the last two months of data,
the usual first station (EVA), planned departure there, last station, planned arrival there, and the weekdays it ran.

  ~/gp-search/venv-dir/v/bin/python scripts/live_trains.py --data-dir ~/gp-search/parquet

Writes data/live-trains.json: { "ICE 1541": [oEva, oName, "HH:MM", dEva, dName, "HH:MM", weekdayBits, minutes] }.
api/live.js reads it to find today's run of a train in DB's Timetables API (plan of the origin station for that hour).
Only patterns seen on at least MIN_SHARE of a train's recent runs are kept, so a number reused for two services keeps
its main one.
"""
import argparse, glob, json, os

import duckdb

LONG = ("ICE", "IC", "EC", "ECE", "RJ", "RJX", "TGV", "FLX")
MIN_RUNS = 8
MIN_SHARE = 0.5


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out", default="data/live-trains.json")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.data_dir, "data-*.parquet")))[-2:]
    con = duckdb.connect()
    con.execute("set memory_limit='1200MB'; set preserve_insertion_order=false")
    # Only stations whose DB Timetables id is verified (data/live-stations.json, the route-page stations): some raw ids
    # point at an S-Bahn or bus level that the API answers without long-distance trains (Hamburg Dammtor, Lindau-Reutin).
    live = json.load(open("data/live-stations.json"))
    # Ids the Timetables API answers without long-distance trains (checked 31 Oct 2026 over three hours each).
    for name in ("Düsseldorf Flughafen", "Köln Messe/Deutz", "Stendal Hbf", "Wolfsburg Hbf"):
        live.pop(name, None)
    con.execute("create table ls(eva varchar, site varchar)")
    con.executemany("insert into ls values (?, ?)", [(v["eva"], k) for k, v in live.items()])
    src = ", ".join(f"'{f}'" for f in files)
    types = ", ".join(f"'{t}'" for t in LONG)
    # Same as short() in routes.py / shortStation() on the site, so raw names meet the verified station list.
    SHORT = ("regexp_replace(regexp_replace(regexp_replace(replace(replace(p.station_name, 'Hauptbahnhof', 'Hbf'), "
             "'Frankfurt am Main Flughafen Fernbahnhof', 'Frankfurt Flughafen'), '^Frankfurt \\(Main\\) ', 'Frankfurt '), "
             "' \\((Westf|Breisgau|Saale|Oder)\\)', '', 'g'), '^Frankfurt Flughafen Fernbahnhof$', 'Frankfurt Flughafen')")
    rows = con.execute(rf"""
    with s as (
      select train_type tt, train_number num, regexp_extract(id, '^(.*-\d{{10}})-\d+$', 1) run,
             -- stop order: planned time, then stop number (rows numbered 100+ sit mid-route), as in compute.py
             epoch(coalesce(arrival_planned_time, departure_planned_time))::bigint * 100000 + train_line_station_num seq,
             ls.eva, ls.site name, departure_planned_time dp, arrival_planned_time ap
      from read_parquet([{src}]) p join ls on ls.site = {SHORT}
      where train_type in ({types}) and not is_replacement_train),
    r as (
      select tt, num, run,
        arg_min(eva, seq) filter (where dp is not null) oe, arg_min(name, seq) filter (where dp is not null) onm,
        min(dp) filter (where dp is not null) odp,
        arg_max(eva, seq) filter (where ap is not null) de, arg_max(name, seq) filter (where ap is not null) dnm,
        max(ap) dap
      from s group by 1, 2, 3),
    r2 as (select tt, num, oe, onm, strftime(odp, '%H:%M') dep, de, dnm, strftime(dap, '%H:%M') arr,
                  isodow(odp) wd, date_diff('minute', odp, dap) mins from r where dap > odp and oe is not null and de is not null),
    g as (select tt, num, oe, de, any_value(onm) onm, any_value(dnm) dnm, mode(dep) dep, mode(arr) arr, count(*) n,
                 bit_or(1 << (wd - 1)) wdays, median(mins) mins, sum(count(*)) over (partition by tt, num) tot
          from r2 group by tt, num, oe, de)
    select tt, num, oe, onm, dep, de, dnm, arr, wdays, mins, n, tot from g
    qualify row_number() over (partition by tt, num order by n desc) = 1
    """).fetchall()
    out = {}
    for tt, num, oe, onm, dep, de, dnm, arr, days, mins, n, tot in rows:
        if n < MIN_RUNS or n < MIN_SHARE * tot:
            continue
        out[f"{tt} {num}"] = [oe, onm, dep, de, dnm, arr, int(days), int(mins)]
    with open(a.out, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    print(f"live trains: {len(out)} of {len(rows)} numbers -> {a.out} ({os.path.getsize(a.out) / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
