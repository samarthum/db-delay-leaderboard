"""Independent recompute of the late-bin split for a few (A, station, B) pairs from raw Parquet.
Different query shape from scripts/connections.py: per-run self join on one station, Python binning.
Same rules: stops in order of planned time, then stop number (a station listed twice at the same planned times is one
stop); A not cancelled, B planned 2..60 min after A, actual change = B actual dep - A actual arr, ok@2/@6 need B not cancelled,
only A's planned arrival time = the listed 't', B's gap = listed gap, months of data/stats.json window."""
import os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Folder with the monthly Parquet files (data-YYYY-MM.parquet) from piebro/deutsche-bahn-data; see docs/STATUS.md.
DATA = os.environ.get("GP_PARQUET") or sys.exit("set GP_PARQUET to the folder with data-YYYY-MM.parquet")
import json, sys
import duckdb

# Data folder (GP_DATA, default data/) and pairs file to check: its connection-pairs.json, or a fresh run (PAIRS=...).
D = os.environ.get("GP_DATA") or os.path.join(ROOT, "data")
P = json.load(open(os.environ.get("PAIRS") or os.path.join(D, "connection-pairs.json")))
months = json.load(open(os.path.join(D, "stats.json")))["window"]["months"]
months_l = months
files = [os.path.join(DATA, f"data-{m}.parquet") for m in months]
BINS = [5, 10, 15, 20, 30, 60]
con = duckdb.connect()
con.execute("set memory_limit='1200MB'; set preserve_insertion_order=false")
cases = [("ICE 1541", "Berlin Hauptbahnhof"), ("ICE 1541", "Hannover Hbf"), ("ICE 545", None), ("ICE 695", None), ("ICE 842", "Bielefeld Hbf")]
# Trains come and go with the window: keep the known cases that are still there, then fill up with the busiest arriving
# trains (most days at their busiest station), so a refresh is always checked on 5 trains.
cases = [c for c in cases if c[0] in P]
for a in sorted(P, key=lambda a: (-max(x["a"][0] for x in P[a]["s"].values()), a)):
    if len(cases) >= 5:
        break
    if all(c[0] != a for c in cases):
        cases.append((a, None))
bad = 0; checked = 0
for a, st in cases:
    t = P[a]["s"]
    st = st if st in t else sorted(t, key=lambda s: -t[s]["a"][0])[0]
    x = t[st]
    for b in x["b"][:3]:
        btr, gap, bins = b[0], b[1], b[12]
        at, an = a.split(" "); bt, bn = btr.split(" ")
        rows = con.execute(f"""
          with raw as (select *, regexp_extract(id, '^(.*-[0-9]{{10}})-[0-9]+$', 1) r from read_parquet({files}) where not is_replacement_train
                         and train_type in ('ICE','IC','EC','ECE','RJ','RJX','FLX','TGV','WB')),
               runs as (select r, min(coalesce(departure_planned_time, arrival_planned_time)) st0 from raw group by r
                        having strftime(min(coalesce(departure_planned_time, arrival_planned_time)), '%Y-%m') in (select unnest({months}))),
               two as (select raw.* from raw join runs using (r) where (train_type=? and train_number=?) or (train_type=? and train_number=?)),
               -- a station (by name) listed twice at the same planned times is one stop (the lowest stop number)
               one as (select two.* from two join (select r, station_name, arrival_planned_time, departure_planned_time, min(train_line_station_num) n
                                                   from two group by all) k
                       on k.r = two.r and k.n = two.train_line_station_num and k.station_name is not distinct from two.station_name
                       and k.arrival_planned_time is not distinct from two.arrival_planned_time
                       and k.departure_planned_time is not distinct from two.departure_planned_time),
               -- neighbours in order of planned time, then stop number (rows numbered 100+ sit mid-route)
               seq as (select one.*,
                         lag(station_name) over (partition by r order by coalesce(arrival_planned_time, departure_planned_time), train_line_station_num) prv,
                         lead(station_name) over (partition by r order by coalesce(arrival_planned_time, departure_planned_time), train_line_station_num) nxt
                       from one),
               A as (select distinct r, arrival_planned_time ap, arrival_change_time aa, prv, nxt from seq
                     where train_type=? and train_number=? and station_name=? and arrival_planned_time is not null
                       and arrival_change_time is not null and not arrival_is_canceled
                       and hour(arrival_planned_time)*60+minute(arrival_planned_time)=?),
               B as (select distinct r, departure_planned_time dp, departure_change_time da, departure_is_canceled dc, nxt from seq
                     where train_type=? and train_number=? and station_name=? and departure_planned_time is not null
                       and departure_change_time is not null)
          select date_diff('minute', ap, aa) late, date_diff('minute', aa, da) ch, dc
          from A join B on B.dp = A.ap + to_minutes(?::bigint) and A.r <> B.r
          where B.nxt is distinct from A.prv and B.nxt is distinct from A.nxt and not (B.nxt is null and B.dc)
        """, [at, an, bt, bn, at, an, st, x["t"], bt, bn, st, gap]).fetchall()
        # The pair's own figures: days, cancelled, worked with 0/2/4/6/8 minutes to change (b[2], b[3], b[6:11]).
        counts = [len(rows), sum(1 for _, _, dc in rows if dc)] + [sum(1 for _, ch, dc in rows if not dc and ch >= m) for m in (0, 2, 4, 6, 8)]
        want = [b[2], b[3]] + b[6:11]
        mine = [0] * 21
        for late, ch, dc in rows:
            i = next((k for k, u in enumerate(BINS) if late <= u), 6)
            mine[3 * i] += 1
            mine[3 * i + 1] += int((not dc) and ch >= 2)
            mine[3 * i + 2] += int((not dc) and ch >= 6)
        checked += 1
        okk = mine == bins and counts == want
        bad += not okk
        print("OK " if okk else "DIFF", a, st, btr, gap, "n", sum(bins[0::3]), "mine", sum(mine[0::3]), "" if okk else f"\n   file {want} {bins}\n   mine {counts} {mine}")
print(f"checked {checked}, differences {bad}")
sys.exit(1 if bad else 0)
