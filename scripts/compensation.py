#!/usr/bin/env python3
"""How often a long-distance trip arrives 60 and 120 minutes or more late: the two steps of the German/EU compensation rules.

  python scripts/compensation.py --data-dir DIR       # DIR holds data-YYYY-MM.parquet; needs data/stats.json and data/routes.json

The rules themselves (what is paid, for which ticket, which exceptions) live in the page copy, not here. This script only
counts. Definitions are the ones the rest of the site uses (compute.py, routes.py): a run belongs to the month of its
scheduled start, its delay is the arrival delay at its last stop that was not cancelled, a delay counts when it is between
clampMin and clampMax, and a cancelled run is not "measured". A rider's delay is the delay at the station on the ticket, so
the route numbers (arrival at B for runs that stop at A and later at B) are the closest to a rider's trip; the network and
train-type numbers use the train's last stop and say so.

Output data/compensation.json:
  network   {measured, n15, n60, n120, p15, p60, p120, cancelled, runs}
  monthly   [{month, measured, p60, p120}]
  types     {ICE: {measured, p60, p120}, ...}
  routes    {slug: [trips, p60, p120]}   for the pages of data/routes.json (same pairs, same trips as routes.json)
"""
import argparse
import importlib.util
import json
import sys
import tempfile
import time
from pathlib import Path

import duckdb

RUN_KEY = r"hash(regexp_extract(id, '^(.*-\d{10})-\d+$', 1))"
# Stop order and duplicate stops: the same rule as compute.py (planned time, then stop number; a station listed twice at
# the same planned times is one stop).
from compute import ONE_ROW_PER_STOP, STOP_ORDER  # noqa: E402


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def load_routes_module():
    spec = importlib.util.spec_from_file_location("routes_mod", Path(__file__).with_name("routes.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--stats", default="data/stats.json")
    ap.add_argument("--routes", default="data/routes.json")
    ap.add_argument("--out", default="data/compensation.json")
    ap.add_argument("--memory-limit", default="1400MB")
    args = ap.parse_args()

    rm = load_routes_module()
    stats = json.loads(Path(args.stats).read_text())
    routes = json.loads(Path(args.routes).read_text())
    window, p = stats["window"], stats["params"]
    lo, hi = p["clampMinMinutes"], p["clampMaxMinutes"]
    ld = ", ".join(sql_str(t) for t in p["longDistanceTypes"])
    months = "[" + ", ".join(sql_str(m) for m in window["months"]) + "]"
    srcs = "[" + ", ".join(sql_str(str(Path(args.data_dir) / f"data-{m}.parquet")) for m in window["months"]) + "]"
    tmp = Path(tempfile.gettempdir()) / "db-delay-duckdb"
    tmp.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(f"set memory_limit = {sql_str(args.memory_limit)}; set temp_directory = {sql_str(str(tmp))}; set preserve_insertion_order = false; set threads = 2")
    t0 = time.time()

    con.execute(f"""
    create table s as
    select * from (
      select {RUN_KEY} run, train_type tt, train_number num, train_line_station_num seq, {STOP_ORDER} ord, station_name name,
        arrival_is_canceled or departure_is_canceled canc, arrival_planned_time arr_plan, departure_planned_time dep_plan,
        date_diff('minute', arrival_planned_time, arrival_change_time) d,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {RUN_KEY}) start
      from read_parquet({srcs})
      where not is_replacement_train and train_type in ({ld})
      {ONE_ROW_PER_STOP})
    where strftime(start, '%Y-%m') in (select unnest({months}))
    """)
    log(f"stop rows: {con.execute('select count(*) from s').fetchone()[0]} in {time.time() - t0:.1f}s")

    # One row per run: its delay at the last stop (by planned time, then stop number) that was not cancelled and has a planned arrival and a measured delay.
    con.execute(f"""
    create table r as
    select run, any_value(tt) tt, min(start) start_plan, bool_and(canc) all_canc,
      arg_max(d, ord) filter (where not canc and arr_plan is not null and d is not null) delay
    from s group by run
    """)
    q = f"""select count(*) runs, count(*) filter (where all_canc) cancelled,
              count(*) filter (where delay between {lo} and {hi}) measured,
              count(*) filter (where delay between {lo} and {hi} and delay >= 15) n15,
              count(*) filter (where delay between {lo} and {hi} and delay >= 60) n60,
              count(*) filter (where delay between {lo} and {hi} and delay >= 120) n120
            from r"""
    runs, canc, meas, n15, n60, n120 = con.execute(q).fetchone()
    pc = lambda a, b: round(100 * a / b, 2) if b else None
    network = {"runs": runs, "cancelled": canc, "measured": meas, "n15": n15, "n60": n60, "n120": n120,
               "p15": pc(n15, meas), "p60": pc(n60, meas), "p120": pc(n120, meas), "cancelledPct": pc(canc, runs)}
    log(f"network: {network}")

    monthly = []
    for m, mm, a60, a120 in con.execute(f"""
        select strftime(start_plan, '%Y-%m') m, count(*) filter (where delay between {lo} and {hi}),
          count(*) filter (where delay between {lo} and {hi} and delay >= 60),
          count(*) filter (where delay between {lo} and {hi} and delay >= 120)
        from r group by 1 order by 1""").fetchall():
        monthly.append({"month": m, "measured": mm, "p60": pc(a60, mm), "p120": pc(a120, mm)})

    types = {}
    for tt, mm, a60, a120 in con.execute(f"""
        select tt, count(*) filter (where delay between {lo} and {hi}),
          count(*) filter (where delay between {lo} and {hi} and delay >= 60),
          count(*) filter (where delay between {lo} and {hi} and delay >= 120)
        from r group by 1 order by 2 desc""").fetchall():
        if mm >= 500:
            types[tt] = {"measured": mm, "p60": pc(a60, mm), "p120": pc(a120, mm)}

    # Routes: the same pairs and the same measured trips as data/routes.json (a run counts for A -> B when it departs from A and
    # is planned at B later; delay = arrival delay at B, the last row of B in the run).
    slug_set = {r["slug"] for r in routes["routes"]}
    major = [x[0] for x in con.execute(f"select name from s group by name having count(distinct run) >= {routes['params']['majorRuns']}").fetchall()]
    allowed = [(a, b) for a in major for b in major if a != b and f"{rm.slugify(rm.short(a))}-{rm.slugify(rm.short(b))}" in slug_set]
    log(f"stations {len(major)}, allowed pairs {len(allowed)} for {len(slug_set)} route pages")
    con.execute("create table sel(a varchar, b varchar)")
    con.executemany("insert into sel values (?, ?)", allowed)
    # Order by planned time, as routes.py does (the stop numbers of a few runs run against the direction of travel).
    con.execute("""create table sa as select run, name, min(dep_plan) dep_plan from s where dep_plan is not null and name in (select name from sel) group by run, name""")
    con.execute("""create table sb as select run, name, d, canc, arr_plan, coalesce(arr_plan, dep_plan) t from s where name in (select name from sel)
                   qualify row_number() over (partition by run, name order by coalesce(arr_plan, dep_plan) desc nulls last, seq desc) = 1""")
    meas_b = f"not sb.canc and sb.arr_plan is not null and sb.d between {lo} and {hi}"
    out_routes = {}
    check = {}
    for a, b, runs_, mm, nl, a60, a120 in con.execute(f"""
        select sa.name, sb.name, count(*), count(*) filter (where {meas_b}),
          count(*) filter (where {meas_b} and sb.d >= {p['lateMinutes']}),
          count(*) filter (where {meas_b} and sb.d >= 60), count(*) filter (where {meas_b} and sb.d >= 120)
        from sa join sb on sa.run = sb.run and sb.t > sa.dep_plan and sa.name <> sb.name
        join sel on sel.a = sa.name and sel.b = sb.name
        group by 1, 2""").fetchall():
        slug = f"{rm.slugify(rm.short(a))}-{rm.slugify(rm.short(b))}"
        out_routes[slug] = [mm, pc(a60, mm), pc(a120, mm)]
        check[slug] = (mm, round(100 * nl / mm, 1) if mm else None)
    # Same numbers as routes.json or the pairs are not the same pairs.
    bad = [r["slug"] for r in routes["routes"] if check.get(r["slug"]) != (r["trips"], r["late"])]
    log(f"routes: {len(out_routes)} computed; {len(bad)} differ from routes.json in trips or 15-minute share {bad[:5]}")
    if bad or set(out_routes) != slug_set:
        sys.exit("route pairs do not reproduce data/routes.json: not writing")

    doc = {"generatedAt": stats.get("generatedAt"),
           "window": {k: window[k] for k in ("firstMonth", "lastMonth", "monthCount")},
           "network": network, "monthly": monthly, "types": types, "routes": dict(sorted(out_routes.items()))}
    payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
    Path(args.out).write_text(payload)
    log(f"compensation: {len(out_routes)} routes, {len(payload) / 1e3:.0f} kB -> {args.out} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
