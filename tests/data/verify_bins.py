"""Independent recompute of the late-bin split for a few (A, station, B) pairs from raw Parquet.
Different query shape from scripts/connections.py: per-run self join on one station, Python binning.
Same rules: A not cancelled, B planned 2..60 min after A, actual change = B actual dep - A actual arr, ok@2/@6 need B not cancelled,
only A's planned arrival time = the listed 't', B's gap = listed gap, months of data/stats.json window."""
import os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Folder with the monthly Parquet files (data-YYYY-MM.parquet) from piebro/deutsche-bahn-data; see docs/STATUS.md.
DATA = os.environ.get("GP_PARQUET") or sys.exit("set GP_PARQUET to the folder with data-YYYY-MM.parquet")
import json, sys
import duckdb

R = ROOT + "/"
# Pairs file to check: the committed one, or a fresh run of scripts/connections.py (PAIRS=...).
P = json.load(open(os.environ.get("PAIRS") or os.path.join(ROOT, "data", "connection-pairs.json")))
months = json.load(open(R + "data/stats.json"))["window"]["months"]
months_l = months
files = [os.path.join(DATA, f"data-{m}.parquet") for m in months]
BINS = [5, 10, 15, 20, 30, 60]
con = duckdb.connect()
con.execute("set memory_limit='1200MB'; set preserve_insertion_order=false")
cases = [("ICE 1541", "Berlin Hauptbahnhof"), ("ICE 1541", "Hannover Hbf"), ("ICE 545", None), ("ICE 695", None), ("ICE 842", "Bielefeld Hbf")]
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
               seq as (select raw.*, lag(station_name) over (partition by raw.r order by train_line_station_num) prv,
                              lead(station_name) over (partition by raw.r order by train_line_station_num) nxt from raw join runs using (r)
                       where (train_type=? and train_number=?) or (train_type=? and train_number=?)),
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
        mine = [0] * 21
        for late, ch, dc in rows:
            i = next((k for k, u in enumerate(BINS) if late <= u), 6)
            mine[3 * i] += 1
            mine[3 * i + 1] += int((not dc) and ch >= 2)
            mine[3 * i + 2] += int((not dc) and ch >= 6)
        checked += 1
        okk = mine == bins
        bad += not okk
        print("OK " if okk else "DIFF", a, st, btr, gap, "n", sum(bins[0::3]), "mine", sum(mine[0::3]), "" if okk else f"\n   file {bins}\n   mine {mine}")
print(f"checked {checked}, differences {bad}")
sys.exit(1 if bad else 0)
