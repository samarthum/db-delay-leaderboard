#!/usr/bin/env python3
"""Connection odds: how often a change between two long-distance trains works out, by station and planned change time.

  python scripts/connections.py --data-dir DIR        # DIR holds data-YYYY-MM.parquet; needs data/stats.json only

For every station that long-distance trains call at often (MAJOR_RUNS runs in the window), every arriving train A is
paired with every departing train B of the same day that leaves MIN_GAP..MAX_GAP minutes after A is planned to arrive.
That planned gap is the "change time" the timetable (and the DB app) shows. What happened is measured from the real times:

    actual change time = actual departure of B - actual arrival of A      (minutes)

A change "works" at m minutes when the actual change time is at least m (m = how long you need to get to the other
train; 0 means you step off as it is about to leave). A cancelled B counts as a miss and is reported on its own. Pairs
where A was cancelled are not counted: nobody is on it.

Only pairs somebody would actually change between are counted. B must not go back where A came from (that is the same
train turning round) and must not go on to the same next station as A (stay on board). Without this, a planned 3-minute
change at Hannover looked 68% safe; between trains that really part ways it is 46%.

These are all such pairs of trains, not only the ones people really change between. Deutsche Bahn sometimes holds a
connecting train for a late one, and that only happens for real connections, so a real change may do a little better.

Output: data/connections.json        { window, params, stations: [{ name, runs, gaps: [[gap, n, cancelled, ok@0, ok@2, ok@4, ok@6, ok@8]] }] }
        data/connection-pairs.json   { "ICE 1541": { "o": origin, "d": destination, "s": { "Hannover Hbf": {
                                       "i": stop number along the route,
                                       "a": [days, median min late, 90th percentile min late, % 6+ min late, % 15+ min late]  (the arriving train there),
                                       "b": [["ICE 845", planned gap, days, cancelled, departs (minutes), "to", ok@0, ok@2, ok@4, ok@6, ok@8,
                                              [days, median min late leaving, % 6+ min late leaving]], ...] } } } }
                                     the departures within PAIR_MAX_GAP minutes of each arriving train, by station
        connections-daypart.json     the station ladder split by the time of day of the next train (analysis; not shipped)

Ghost entries are dropped: a cancelled departure with no next stop, and a pair whose next train was cancelled on every one
of its days (20 or more; for example "ICE 147 from Berlin Hbf to Berlin Hbf"). Nobody could take them.
"""
import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

import duckdb

RUN_KEY = r"hash(regexp_extract(id, '^(.*-\d{10})-\d+$', 1))"
MAJOR_RUNS = 2000  # runs in the window for a station to be offered
MIN_GAP = 2  # planned change times below this are not a change
MAX_GAP = 60
MIN_N = 40  # pairs a (station, gap) needs before its figures are shown
WALK = [0, 2, 4, 6, 8]  # minutes needed to get to the other train
PAIR_MIN_N = 30  # days a specific (A, B) pair needs before it is listed
PAIR_MAX_GAP = 40
PAIR_MAX_B = 16  # departures listed per (A, station)


def log(msg):
    print(msg, file=sys.stderr, flush=True)


def sql_str(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir")
    ap.add_argument("--cache-dir", default=str(Path(tempfile.gettempdir()) / "db-delay-parquet"))
    ap.add_argument("--stats", default="data/stats.json")
    ap.add_argument("--out", default="data/connections.json")
    ap.add_argument("--memory-limit", default="1500MB")
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
    con.execute(f"set memory_limit = {sql_str(args.memory_limit)}; set temp_directory = {sql_str(str(tmp))}; set preserve_insertion_order = false; set max_temp_directory_size = '3GB'")
    ld = ", ".join(sql_str(t) for t in p["longDistanceTypes"])
    months = "[" + ", ".join(sql_str(m) for m in window["months"]) + "]"
    srcs = "[" + ", ".join(sql_str(s) for s in sources) + "]"
    t0 = time.time()

    con.execute(f"""
    create table s0 as
    select * from (
      select {RUN_KEY} run, train_type tt, train_number num, train_line_station_num seq, station_name name,
        arrival_planned_time ap, arrival_change_time aa, arrival_is_canceled ac,
        departure_planned_time dp, departure_change_time da, departure_is_canceled dc, final_destination_station dest,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {RUN_KEY}) start
      from read_parquet({srcs})
      where not is_replacement_train and train_type in ({ld}))
    where strftime(start, '%Y-%m') in (select unnest({months}))
    """)
    # The stop before and after, to tell a real change from a train turning round or two trains going the same way.
    con.execute("""create table s as select *, lag(name) over (partition by run order by seq) prv, lead(name) over (partition by run order by seq) nxt from s0""")
    con.execute("drop table s0")
    con.execute(f"create table major as select name from s group by name having count(distinct run) >= {MAJOR_RUNS}")
    log(f"stop rows {con.execute('select count(*) from s').fetchone()[0]}, stations {con.execute('select count(*) from major').fetchone()[0]} in {time.time() - t0:.0f}s")

    # Arrivals and departures of the major stations. A departure 2..60 minutes after an arrival is in the same or the next
    # 64-minute bucket, so the join compares only neighbours instead of whole days.
    con.execute("""create table a as select name, run, tt, num, seq, ap, aa, prv, nxt, cast(epoch(ap) / 3840 as bigint) bk from s
                   where ap is not null and aa is not null and not ac and name in (select name from major)""")
    con.execute("""create table b as select name, run, tt, num, dp, da, dc, nxt, dest, cast(epoch(dp) / 3840 as bigint) bk from s
                   where dp is not null and da is not null and name in (select name from major)""")
    log(f"arrivals {con.execute('select count(*) from a').fetchone()[0]}, departures {con.execute('select count(*) from b').fetchone()[0]}")
    gh = con.execute("select count(*), count(*) filter (where dc) from b where nxt is null").fetchone()
    log(f"departures with no next stop: {gh[0]}, of which cancelled: {gh[1]} (the cancelled ones are dropped)")
    ok = ", ".join(f"count(*) filter (where not dc and change >= {m}) ok{m}" for m in WALK)
    con.execute(f"""
    create table g as
    select name, atr, btr, gap, arrt, count(*) n, count(*) filter (where dc) cancelled, {ok}, mode(dep) dep, mode(dest) dest
    from (
      select a.name, a.tt || ' ' || a.num atr, b.tt || ' ' || b.num btr, date_diff('minute', a.ap, b.dp) gap,
        hour(a.ap) * 60 + minute(a.ap) arrt,
        date_diff('minute', a.aa, b.da) change, b.dc, hour(b.dp) * 60 + minute(b.dp) dep, b.dest
      from a join b on a.name = b.name and (b.bk = a.bk or b.bk = a.bk + 1) and a.run <> b.run
      where b.dp >= a.ap + interval {MIN_GAP} minute and b.dp <= a.ap + interval {MAX_GAP} minute
        and b.nxt is distinct from a.prv and b.nxt is distinct from a.nxt and not (a.tt = b.tt and a.num = b.num)
        and not (b.nxt is null and b.dc))
    group by name, atr, btr, gap, arrt
    """)
    # The same train is often planned at different clock times on different days (timetable variants, works). A pair is
    # kept per planned arrival time of A, so that a listed row is one timetable: the departure time is arrival + change time.
    # A pair whose next train was cancelled on every one of its days (20 or more) is a ghost: a planned train with nothing
    # behind it ("ICE 147 from Berlin Hbf to Berlin Hbf"). Nobody could take it, so it is not a connection.
    con.execute("create table ghosts as select name, atr, btr, gap from g group by 1, 2, 3, 4 having sum(cancelled) = sum(n) and sum(n) >= 20")
    gh = con.execute("select count(*), coalesce((select sum(n) from g join ghosts using (name, atr, btr, gap)), 0) from ghosts").fetchone()
    con.execute("delete from g where (name, atr, btr, gap) in (select name, atr, btr, gap from ghosts)")
    log(f"ghost pairs dropped: {gh[0]} ({gh[1]} pair-days)")
    log(f"(station, A, B, gap) groups {con.execute('select count(*) from g').fetchone()[0]} in {time.time() - t0:.0f}s")

    sums = ", ".join(f"sum(ok{m})" for m in WALK)  # (dep and dest are only kept per pair, not per station and gap)
    con.execute(f"create table lad as select name, gap, sum(n) n, sum(cancelled) cancelled, {sums} from g group by name, gap")
    runs = dict(con.execute("select name, count(distinct run) from s where name in (select name from major) group by 1").fetchall())
    out = []
    for name in sorted(runs):
        rows = con.execute(f"select * from lad where name = ? and n >= {MIN_N} order by gap", [name]).fetchall()
        if rows:
            out.append({"name": name, "runs": runs[name], "gaps": [[int(x) for x in r[1:]] for r in rows]})
    doc = {
        "generatedAt": stats.get("generatedAt"),
        "window": {k: window[k] for k in ("firstMonth", "lastMonth", "monthCount")},
        "params": {"minGap": MIN_GAP, "maxGap": MAX_GAP, "minN": MIN_N, "walk": WALK, "majorRuns": MAJOR_RUNS},
        "stations": out,
    }
    payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"
    Path(args.out).write_text(payload)
    log(f"connections: {len(out)} stations, {len(payload) / 1e6:.2f} MB -> {args.out} in {time.time() - t0:.0f}s")

    # The ladder split by the time of day of the next train (to see whether it matters; not shipped).
    part = "case when dep >= 300 and dep < 600 then 'morning' when dep >= 600 and dep < 960 then 'midday' when dep >= 960 and dep < 1260 then 'evening' else 'night' end"
    dpart = {}
    for r in con.execute(f"select name, {part} p, gap, sum(n), sum(cancelled), {sums} from g group by 1, 2, 3 having sum(n) >= {MIN_N} order by 1, 2, 3").fetchall():
        dpart.setdefault(r[0], {}).setdefault(r[1], {})[int(r[2])] = [int(x) for x in r[3:]]
    Path(args.out).with_name("connections-daypart.json").write_text(json.dumps(dpart, ensure_ascii=False, separators=(",", ":")) + "\n")

    # The arriving train at each station (how late it really is there) and the ends of each train.
    asum = {}
    for name, atr, n, seq, q50, q90, l6, l15 in con.execute("""select name, tt || ' ' || num, count(*), mode(seq),
        quantile_cont(date_diff('minute', ap, aa), 0.5), quantile_cont(date_diff('minute', ap, aa), 0.9),
        count(*) filter (where date_diff('minute', ap, aa) >= 6), count(*) filter (where date_diff('minute', ap, aa) >= 15)
        from a group by 1, 2""").fetchall():
        asum[(atr, name)] = [int(n), int(seq or 0), round(q50), round(q90), round(100 * l6 / n), round(100 * l15 / n)]
    ends = {atr: (o or "", d or "") for atr, o, d in con.execute("""select atr, mode(o), mode(d) from (
        select tt || ' ' || num atr, run, arg_min(name, seq) o, arg_max(name, seq) d from s group by 1, 2) group by 1""").fetchall()}
    # How late the next train really leaves from that station (cancelled ones are counted in the pair, not here).
    bsum = {}
    for name, btr, n, q50, l6 in con.execute("""select name, tt || ' ' || num, count(*), quantile_cont(date_diff('minute', dp, da), 0.5),
        count(*) filter (where date_diff('minute', dp, da) >= 6) from b where not dc group by 1, 2""").fetchall():
        bsum[(btr, name)] = [int(n), round(q50), round(100 * l6 / n)]
    log(f"arriving-train summaries {len(asum)}, departing-train summaries {len(bsum)}, train ends {len(ends)} in {time.time() - t0:.0f}s")

    # Per arriving train: its departures at each station, the planned gap that pair has most often.
    # Only the planned arrival time of A that most pair-days have (its main timetable) is listed; the others are rarer variants.
    con.execute("""create table anchor as select atr, name, arrt from (
        select atr, name, arrt, row_number() over (partition by atr, name order by sum(n) desc, arrt) r from g group by 1, 2, 3) where r = 1""")
    rows = con.execute(f"""
    select atr, name, btr, gap, n, cancelled, ok0, ok2, ok4, ok6, ok8, dep, dest, arrt from (
      select g.atr, g.name, btr, gap, n, cancelled, ok0, ok2, ok4, ok6, ok8, dep, dest, g.arrt,
        row_number() over (partition by g.atr, g.name, btr order by n desc) r
      from g join anchor on g.atr = anchor.atr and g.name = anchor.name and g.arrt = anchor.arrt)
    where r = 1 and n >= {PAIR_MIN_N} and gap <= {PAIR_MAX_GAP} order by atr, name, gap, btr""").fetchall()
    pairs = {}
    for atr, name, btr, gap, n, canc, ok0, ok2, ok4, ok6, ok8, dep, dest, arrt in rows:
        o, d = ends.get(atr, ("", ""))
        t = pairs.setdefault(atr, {"o": o, "d": d, "s": {}})
        a_ = asum[(atr, name)]
        # "t": the planned arrival of A (minutes after midnight) that the listed pairs belong to.
        st = t["s"].setdefault(name, {"i": a_[1], "a": [a_[0]] + a_[2:], "t": int(arrt), "b": []})
        if len(st["b"]) < PAIR_MAX_B:
            st["b"].append([btr, int(gap), int(n), int(canc), int(dep), dest or "", int(ok0), int(ok2), int(ok4), int(ok6), int(ok8), bsum.get((btr, name), [0, 0, 0])])
    ppath = Path(args.out).with_name("connection-pairs.json")
    ppayload = json.dumps(pairs, ensure_ascii=False, separators=(",", ":")) + "\n"
    ppath.write_text(ppayload)
    log(f"pairs: {len(pairs)} arriving trains, {sum(len(v['s']) for v in pairs.values())} (train, station) lists, {len(ppayload) / 1e6:.2f} MB -> {ppath} in {time.time() - t0:.0f}s")

if __name__ == "__main__":
    main()
