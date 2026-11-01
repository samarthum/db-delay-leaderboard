"""Independent check of per-train average delay on a route: different query shape (self-join per run on station rows)."""
import os, sys
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# Folder with the monthly Parquet files (data-YYYY-MM.parquet) from piebro/deutsche-bahn-data; see docs/STATUS.md.
DATA = os.environ.get("GP_PARQUET") or sys.exit("set GP_PARQUET to the folder with data-YYYY-MM.parquet")
import json, duckdb, glob
P = sorted(glob.glob(os.path.join(DATA, 'data-*.parquet')))
routes = {r['slug']: r for r in json.load(open(os.path.join(ROOT, 'data/routes.json')))['routes']}
cases = [('hamburg-hbf-berlin-hbf', 'ICE', '2585', 'Hamburg Hbf', 'Berlin Hauptbahnhof'),
         ('hamburg-hbf-berlin-hbf', 'RJ', '171', 'Hamburg Hbf', 'Berlin Hauptbahnhof'),
         ('koeln-hbf-berlin-hbf', None, None, 'Köln Hbf', 'Berlin Hauptbahnhof'),
         ('muenchen-hbf-nuernberg-hbf', None, None, 'München Hbf', 'Nürnberg Hbf')]
con = duckdb.connect(); con.execute("set memory_limit='1200MB'")
src = ','.join(f"'{p}'" for p in P)
for slug, tt, num, a, b in cases:
    r = routes[slug]
    if tt is None:
        t = max((x for x in r['list'] if x[6] is not None), key=lambda x: x[5]); tt, num = t[0], t[1]
    want = next(x for x in r['list'] if x[0] == tt and x[1] == num)
    q = f"""
    with x as (select train_type tt, train_number num, station_name n, train_line_station_num seq,
                 date_trunc('day', coalesce(departure_planned_time, arrival_planned_time)) dday,
                 arrival_is_canceled or departure_is_canceled c, arrival_planned_time ap,
                 date_diff('minute', arrival_planned_time, arrival_change_time) d, departure_planned_time dp
               from read_parquet([{src}]) where train_type='{tt}' and train_number='{num}' and not is_replacement_train),
    A as (select * from x where n='{a}' and dp is not null),
    B as (select * from x where n='{b}')
    select count(*), avg(B.d) from A join B on A.tt=B.tt and A.num=B.num and B.seq > A.seq
      and date_diff('hour', A.dp, B.ap) between 0 and 12
    where not B.c and B.ap is not null and B.d between -10 and 600"""
    n, avg = con.execute(q).fetchone()
    print(slug, tt, num, 'site', want[6], 'n', want[5], '| raw', round(avg, 1) if avg is not None else None, 'n', n)
