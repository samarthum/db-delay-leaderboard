"""Independent re-check of every file family the monthly refresh rewrites, straight from the monthly Parquet files.

  python tests/data/verify_monthly.py --parquet DIR [--data data] [--sample 60]

Shares no code with scripts/compute.py, stops.py, routes.py, connections.py or compensation.py; reproduces their scope
rules (docs/RULES.md, Data): a ride is the rows with the same "<trip>-<yyMMddHHmm>" id prefix, it belongs to the month of
its scheduled start (earliest planned time) and counts only in window months; its delay is the arrival delay at its
last stop (by stop number) that was not cancelled and has a planned arrival; a delay is measured when within the clamp;
long-distance types from stats.json params; regional = a line prefix (RE, RB, ...) that is not a bus. Query shapes differ:
last stops by window function instead of aggregate, regional line components by a separate union-find over ride edges,
route pairs by planned time from per-station minima, the change-train ladder by a self-join per station.

Checked (exactly; averages and shares within 0.05 of the unrounded recompute, i.e. the same after rounding):
  stats.json / monthly.json  long-distance and regional: runs, measured, average, cancelled per month; overall; headline;
                             recap counts (long-distance)
  trains/*.json, lines/*.json runs, measured, average, cancelled, 6-min share, monthly series, worst delay
  search/s-*.json            every record of every kind: runs, measured, average, 15+ share, cancelled, 6-min share,
                             latest months (field 17); kinds 1 and 2 as a multiset per line (and number)
  stations.json              every station: arrivals measured and average
  stops.json                 every stop of a sample of trains: runs, measured, 15+ share, average, cancelled
  routes.json                every route: runs, trips, 15+ and 6+ shares, average, cancelled; every train row: measured,
                             15+ share, average; no row runs the other way (arrival more than 12 h after departure, or a
                             train whose measured runs A -> B by planned time differ from the row)
  connections.json           the change-time ladder of the two busiest stations
  compensation.json          network, per month and per type: runs, cancelled, measured, 15/60/120+ counts
connection-pairs.json is re-checked by tests/data/verify_bins.py. Exit 1 on any difference.
"""
import argparse
import json
import os
import random
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

import duckdb

PREFIX = r"regexp_extract(id, '^(.*-[0-9]{10})-[0-9]+$', 1)"
TOL = 0.0500001


def q(con, sql, params=None):
    cur = con.execute(sql, params or [])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


class Report:
    def __init__(self):
        self.fam = defaultdict(lambda: [0, 0, []])

    def same(self, family, what, file_value, mine, exact=False):
        f = self.fam[family]
        f[0] += 1
        if file_value is None and mine is None:
            return True
        if file_value is None or mine is None:
            ok = False
        elif exact or isinstance(file_value, (int, str)) and not isinstance(file_value, bool) and isinstance(mine, (int, str)):
            ok = file_value == mine
        else:
            ok = abs(float(file_value) - float(mine)) <= TOL
        if not ok:
            f[1] += 1
            if len(f[2]) < 12:
                f[2].append(f"{what}: file {file_value!r}, recompute {mine if not isinstance(mine, float) else round(mine, 4)!r}")
        return ok

    def fail(self, family, msg):
        f = self.fam[family]
        f[0] += 1
        f[1] += 1
        if len(f[2]) < 12:
            f[2].append(msg)

    def done(self):
        bad = 0
        for fam, (n, d, ex) in sorted(self.fam.items()):
            print(f"{'OK  ' if not d else 'DIFF'} {fam}: {n:,} values checked, {d:,} differences")
            for e in ex:
                print(f"       {e}")
            bad += d
        print(f"total: {sum(v[0] for v in self.fam.values()):,} values, {bad:,} differences")
        return bad


def pct(a, b):
    return 100.0 * a / b if b else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", required=True, help="folder with data-YYYY-MM.parquet")
    ap.add_argument("--data", default="data", help="data folder to check (default: data)")
    ap.add_argument("--sample", type=int, default=60, help="trains sampled for stops.json (default 60)")
    ap.add_argument("--memory-limit", default=os.environ.get("GP_MEMORY", "6GB"))
    args = ap.parse_args()
    data = Path(args.data)
    stats = json.loads((data / "stats.json").read_text())
    window, p = stats["window"], stats["params"]
    months = window["months"]
    lo, hi, late = p["clampMinMinutes"], p["clampMaxMinutes"], p["lateMinutes"]
    files = [str(Path(args.parquet) / f"data-{m}.parquet") for m in months]
    for f in files:
        if not Path(f).exists():
            sys.exit(f"missing {f}")
    ld = "(" + ", ".join(f"'{t}'" for t in p["longDistanceTypes"]) + ")"
    prefixes = "(" + ", ".join(f"'{t}'" for t in p["regionalLinePrefixes"]) + ")"
    mlist = "(" + ", ".join(f"'{m}'" for m in months) + ")"
    src = "[" + ", ".join(f"'{f}'" for f in files) + "]"
    tmp = Path(tempfile.gettempdir()) / "gp-verify-monthly"
    tmp.mkdir(exist_ok=True)
    con = duckdb.connect()
    con.execute(f"set memory_limit = '{args.memory_limit}'; set temp_directory = '{tmp}'; set preserve_insertion_order = false")
    rep = Report()

    # ------------------------------------------------------------ long-distance stop rows and rides
    con.execute(f"""
    create table ld as
    select {PREFIX} ride, train_type tt, train_number num, train_line_station_num seq, try_cast(eva as integer) eva,
      station_name name, arrival_is_canceled ca, departure_is_canceled cd, final_destination_station dest,
      arrival_planned_time ap, departure_planned_time dp, arrival_change_time ac, departure_change_time dc,
      date_diff('minute', arrival_planned_time, arrival_change_time) ad
    from read_parquet({src}) where not is_replacement_train and train_type in {ld}""")
    con.execute("""
    create table ld_start as select ride, min(coalesce(dp, ap)) start, bool_and(ca or cd) all_canc,
      first(tt) tt, first(num) num from ld group by ride""")
    con.execute(f"""
    create table ld_ride as
    select s.ride, s.tt, s.num, s.tt || ' ' || s.num unit, s.start, strftime(s.start, '%Y-%m') as month, s.all_canc, f.ad delay,
      coalesce(f.ad between {lo} and {hi}, false) ok
    from ld_start s left join (
      select ride, ad from ld where not (ca or cd) and ap is not null and ad is not null
      qualify row_number() over (partition by ride order by seq desc) = 1) f using (ride)
    where strftime(s.start, '%Y-%m') in {mlist}""")
    n_ld = con.execute("select count(*) from ld_ride").fetchone()[0]
    print(f"long-distance rides in the window: {n_ld:,}", flush=True)

    # ------------------------------------------------------------ regional rides, lines as components
    con.execute(f"""
    create table rg_ride as
    select ride, any_value(line) line, any_value(num) num, arg_min(eva, seq) first_eva, list(distinct eva) evas,
      min(coalesce(dp, ap)) start, bool_and(canc) all_canc,
      arg_max(ad, seq) filter (where not canc and ap is not null and ad is not null) delay
    from (
      select {PREFIX} ride, regexp_replace(line_number, '^([A-Z]+)\\s*', '\\1 ') line, train_number num,
        train_line_station_num seq, try_cast(eva as integer) eva, arrival_is_canceled or departure_is_canceled canc,
        arrival_planned_time ap, departure_planned_time dp,
        date_diff('minute', arrival_planned_time, arrival_change_time) ad
      from read_parquet({src})
      where not is_replacement_train and train_type not in {ld} and train_type <> 'Bus'
        and regexp_extract(coalesce(line_number, ''), '^([A-Z]+)[0-9]', 1) in {prefixes})
    group by ride""")
    # A line is a code plus the stations its rides connect (RE 19 runs in two regions): union-find over (line, station)
    # with an edge from each ride's first station id (arg_min skips rows without one) to every other station of the ride.
    parent = {}

    def find(x):
        parent.setdefault(x, x)
        root = x
        while parent[root] != root:
            root = parent[root]
        while parent[x] != root:
            parent[x], x = root, parent[x]
        return root

    for line, a, b in con.execute("select distinct line, first_eva, unnest(evas) from rg_ride where first_eva is not null").fetchall():
        ra, rb = find((line, a)), find((line, b) if b is not None else (line, a))
        if ra != rb:
            parent[rb] = ra
    low = {}
    for node in list(parent):
        r = find(node)
        low[r] = min(low.get(r, node[1]), node[1])
    comp_rows = {node: low[find(node)] for node in parent}
    con.execute("create table comp(line varchar, eva integer, c integer)")
    con.executemany("insert into comp values (?, ?, ?)", [(k[0], k[1], v) for k, v in comp_rows.items()])
    con.execute(f"""
    create table rg as
    select r.ride, r.line, r.num, r.line || '#' || comp.c unit, r.start, strftime(r.start, '%Y-%m') as month, r.all_canc,
      r.delay, coalesce(r.delay between {lo} and {hi}, false) ok
    from rg_ride r join comp on comp.line = r.line and comp.eva = r.first_eva
    where strftime(r.start, '%Y-%m') in {mlist}""")
    print(f"regional rides in the window: {con.execute('select count(*) from rg').fetchone()[0]:,}, "
          f"lines {con.execute('select count(distinct unit) from rg').fetchone()[0]:,}", flush=True)

    agg = f"""count(*) runs, count(*) filter (where ok) measured, avg(delay) filter (where ok) avg,
      100.0 * count(*) filter (where ok and delay >= {late}) / nullif(count(*) filter (where ok), 0) late,
      100.0 * count(*) filter (where ok and delay >= 6) / nullif(count(*) filter (where ok), 0) late6,
      100.0 * avg(all_canc::int) canc, max(delay) filter (where ok) worst"""

    # ------------------------------------------------------------ stats.json, monthly.json
    mon = json.loads((data / "monthly.json").read_text())
    for cat, table in (("longDistance", "ld_ride"), ("regional", "rg")):
        mine = {r["month"]: r for r in q(con, f"select month, {agg} from {table} group by month")}
        for m in mon["series"][cat]:
            x = mine.get(m["month"], {})
            rep.same("monthly.json", f"{cat} {m['month']} runs", m["runs"], x.get("runs"))
            rep.same("monthly.json", f"{cat} {m['month']} measured", m["measured"], x.get("measured"))
            rep.same("monthly.json", f"{cat} {m['month']} avg", m["avgDelayMin"], x.get("avg"))
            rep.same("monthly.json", f"{cat} {m['month']} cancelled", m["fullCancelPct"], x.get("canc"))
        o = q(con, f"select {agg}, count(distinct unit) units from {table}")[0]
        so = stats["overall"][cat]
        rep.same("stats.json", f"{cat} runs", so["runs"], o["runs"])
        rep.same("stats.json", f"{cat} measured", so["measuredRuns"], o["measured"])
        rep.same("stats.json", f"{cat} avg", so["avgDelayMin"], o["avg"])
        rep.same("stats.json", f"{cat} cancelled", so["fullCancelPct"], o["canc"])
        rep.same("stats.json", f"{cat} units", so["units"], o["units"])
        hm = stats["headline"]["months"]
        h = q(con, f"select {agg} from {table} where month in ({', '.join(repr(m) for m in hm)})")[0]
        sh = stats["headline"]["categories"][cat]
        rep.same("stats.json", f"{cat} headline measured", sh["measured"], h["measured"])
        rep.same("stats.json", f"{cat} headline avg", sh["avgDelayMin"], h["avg"])
        rep.same("stats.json", f"{cat} headline cancelled", sh["fullCancelPct"], h["canc"])
        rc = stats["recap"][cat]
        r = q(con, f"""select count(*) filter (where all_canc) cancelled, count(*) filter (where ok and delay >= {late}) l15,
                         count(*) filter (where ok and delay >= 60) l60, count(*) filter (where ok and delay >= 6) l6 from {table}""")[0]
        for k, v in (("cancelled", "cancelled"), ("lateRuns", "l15"), ("late60Runs", "l60"), ("late6Runs", "l6")):
            rep.same("stats.json", f"{cat} recap {k}", rc[k], r[v])

    # ------------------------------------------------------------ search records (every kind)
    by_unit = {r["unit"]: r for r in q(con, f"select unit, {agg} from ld_ride group by unit")}
    rg_unit = {r["unit"]: r for r in q(con, f"select unit, any_value(line) line, {agg} from rg group by unit")}
    rg_num = {(r["unit"], r["num"]): r for r in q(con, f"select unit, num, any_value(line) line, {agg} from rg group by unit, num")}
    last3, last1 = months[-p.get("searchRecentMonths", 3):], months[-p.get("searchRecentMonthsRegional", 1):]
    recent = defaultdict(list)
    for r in q(con, f"""select unit, month, count(*) n, avg(delay) a from ld_ride where ok and month in ({', '.join(repr(m) for m in last3)})
                         group by unit, month order by unit, month"""):
        recent[("ld", r["unit"])].append([r["month"], r["n"], r["a"]])
    for r in q(con, f"""select unit, month, count(*) n, avg(delay) a from rg where ok and month in ({', '.join(repr(m) for m in last1)})
                         group by unit, month order by unit, month"""):
        recent[("line", r["unit"])].append([r["month"], r["n"], r["a"]])
    for r in q(con, f"""select unit, num, month, count(*) n, avg(delay) a from rg where ok and month in ({', '.join(repr(m) for m in last1)})
                         group by unit, num, month order by unit, num, month"""):
        recent[("rt", r["unit"], r["num"])].append([r["month"], r["n"], r["a"]])

    def same_recent(family, what, file_rec, mine_rec):
        if len(file_rec) != len(mine_rec):
            rep.fail(family, f"{what} latest months: file {file_rec}, recompute {[[a, b, round(c, 2)] for a, b, c in mine_rec]}")
            return
        for (fm, fn, fa), (mm, mn, ma) in zip(file_rec, mine_rec):
            rep.same(family, f"{what} {fm} month", fm, mm, exact=True)
            rep.same(family, f"{what} {fm} runs", fn, mn)
            rep.same(family, f"{what} {fm} avg", fa, ma)

    def rec_fields(r):
        return {"runs": r[3], "measured": r[4], "avg": r[5], "late": r[6], "canc": r[7], "late6": r[16] if len(r) > 16 else None}

    def close(fr, x):
        return (fr["runs"] == x["runs"] and fr["measured"] == x["measured"]
                and all(abs((fr[k] or 0) - (x[k] or 0)) <= TOL for k in ("avg", "late", "canc", "late6") if fr[k] is not None))

    shards = sorted((data / "search").glob("s-*.json"))
    kind1, kind2 = defaultdict(list), defaultdict(list)
    n_records = 0
    for path in shards:
        for r in json.loads(path.read_text(encoding="utf-8")):
            n_records += 1
            if r[2] == 0:
                unit = f"{r[0]} {r[1]}"
                x = by_unit.get(unit)
                if x is None:
                    rep.fail("search kind 0 (trains)", f"{unit}: no rides in the recompute")
                    continue
                fr = rec_fields(r)
                for k in ("runs", "measured", "avg", "late", "canc", "late6"):
                    rep.same("search kind 0 (trains)", f"{unit} {k}", fr[k], x[k])
                rep.same("search kind 0 (trains)", f"{unit} worst", r[11][1], x["worst"])
                same_recent("search kind 0 (trains)", unit, r[17] if len(r) > 17 else [], recent.get(("ld", unit), []))
            elif r[2] == 1:
                kind1[f"{r[0]} {r[1]}"].append(r)
            else:
                kind2[(r[15], r[1])].append(r)
    # Lines and regional train numbers: the record does not name its component, so compare as a multiset per line (and number).
    mine1, mine2 = defaultdict(list), defaultdict(list)
    for unit, x in rg_unit.items():
        if x["measured"] >= p["searchMinRuns"]:
            mine1[x["line"]].append((unit, x))
    for (unit, num), x in rg_num.items():
        if x["measured"] >= p["searchMinRuns"]:
            mine2[(x["line"], num)].append(((unit, num), x))
    for family, files_by, mine_by, key in (("search kind 1 (lines)", kind1, mine1, lambda k: ("line", k)),
                                           ("search kind 2 (regional numbers)", kind2, mine2, lambda k: ("rt",) + k)):
        for k in sorted(set(files_by) | set(mine_by), key=str):
            recs, cands = files_by.get(k, []), list(mine_by.get(k, []))
            for r in recs:
                fr = rec_fields(r)
                hit = next((c for c in cands if close(fr, c[1])), None)
                rep.fam[family][0] += 1
                if hit is None:
                    rep.fail(family, f"{k}: record {[fr[x] for x in ('runs', 'measured', 'avg', 'late', 'canc')]} not in the recompute "
                                     f"{[[c[1][x] for x in ('runs', 'measured')] for c in cands][:4]}")
                    continue
                cands.remove(hit)
                same_recent(family, str(k), r[17] if len(r) > 17 else [], recent.get(key(hit[0]) if family.startswith("search kind 1") else ("rt",) + hit[0], []))
            if cands and recs is not None:
                # A recompute unit with no record: the pipeline skips units whose end stations have no name; few allowed.
                rep.fam[family + ", units without a record"][0] += len(cands)
    print(f"search: {n_records:,} records in {len(shards)} shards", flush=True)

    # ------------------------------------------------------------ trains/*.json, lines/*.json
    ld_month = defaultdict(dict)
    for r in q(con, "select unit, month, count(*) n, avg(delay) a from ld_ride where ok group by unit, month"):
        ld_month[r["unit"]][r["month"]] = r
    rg_month = defaultdict(dict)
    for r in q(con, "select unit, month, count(*) n, avg(delay) a from rg where ok group by unit, month"):
        rg_month[r["unit"]][r["month"]] = r
    for folder, family in (("trains", "trains/*.json"), ("lines", "lines/*.json")):
        for path in sorted((data / folder).glob("*.json")):
            t = json.loads(path.read_text(encoding="utf-8"))
            if folder == "trains":
                unit, x = t["name"], by_unit.get(t["name"])
            else:
                cands = [(u, v) for u, v in rg_unit.items() if v["line"] == t["name"] and v["runs"] == t["runs"] and v["measured"] == t["measured"]]
                unit, x = cands[0] if len(cands) == 1 else (None, None)
            if x is None:
                rep.fail(family, f"{path.name}: no matching unit in the recompute")
                continue
            rep.same(family, f"{path.stem} runs", t["runs"], x["runs"])
            rep.same(family, f"{path.stem} measured", t["measured"], x["measured"])
            rep.same(family, f"{path.stem} avg", t["minutes"]["avg"], x["avg"])
            rep.same(family, f"{path.stem} cancelled", t["fullCancelPct"], x["canc"])
            rep.same(family, f"{path.stem} 6-min", t.get("late6Pct"), x["late6"])
            rep.same(family, f"{path.stem} worst", t["worstRun"]["delayMin"], x["worst"])
            per = (ld_month if folder == "trains" else rg_month)[unit]
            for m in t["monthly"]:
                y = per.get(m["month"])
                rep.same(family, f"{path.stem} {m['month']} runs", m["runs"], y["n"] if y else 0)
                rep.same(family, f"{path.stem} {m['month']} avg", m["avg"], y["a"] if y else None)

    # ------------------------------------------------------------ stations.json
    st = q(con, f"""
    select name, n, a from (
      select try_cast(eva as integer) eva, mode(station_name) name,
        count(*) filter (where ok) n, avg(d) filter (where ok) a
      from (select eva, station_name, date_diff('minute', arrival_planned_time, arrival_change_time) d,
              coalesce(not arrival_is_canceled and date_diff('minute', arrival_planned_time, arrival_change_time) between {lo} and {hi}
                       and strftime(arrival_planned_time, '%Y-%m') in {mlist}, false) ok
            from read_parquet({src})
            where not is_replacement_train and (train_type in {ld} or (train_type <> 'Bus'
              and regexp_extract(coalesce(line_number, ''), '^([A-Z]+)[0-9]', 1) in {prefixes})))
      where try_cast(eva as integer) is not null group by 1)""")
    mine_st = defaultdict(list)
    for r in st:
        mine_st[r["name"]].append(r)
    for s in json.loads((data / "stations.json").read_text())["stations"]:
        hit = next((c for c in mine_st.get(s["name"], []) if c["n"] == s["n"] and abs(c["a"] - s["avg"]) <= TOL), None)
        rep.fam["stations.json"][0] += 1
        if hit is None:
            rep.fail("stations.json", f"{s['name']}: file n {s['n']} avg {s['avg']}, recompute {[(c['n'], round(c['a'], 2)) for c in mine_st.get(s['name'], [])]}")

    # ------------------------------------------------------------ stops.json (a sample of trains, every stop)
    stops = json.loads((data / "stops.json").read_text())
    rng = random.Random(1)
    sample = stops["trains"] if len(stops["trains"]) <= args.sample else rng.sample(stops["trains"], args.sample)
    con.execute("create table pick(tt varchar, num varchar)")
    con.executemany("insert into pick values (?, ?)", [(t[0], t[1]) for t in sample])
    mine_stop = {(r["tt"], r["num"], r["name"]): r for r in q(con, f"""
        select ld.tt, ld.num, ld.name, count(*) runs,
          count(*) filter (where m) measured, 100.0 * count(*) filter (where m and ld.ad >= {late}) / nullif(count(*) filter (where m), 0) late,
          avg(ld.ad) filter (where m) a, 100.0 * avg((ld.ca or ld.cd)::int) canc
        from (select ld.*, not (ca or cd) and ap is not null and ad between {lo} and {hi} m from ld) ld
        join pick using (tt, num) join ld_start s using (ride)
        where ld.eva is not null and strftime(s.start, '%Y-%m') in {mlist}
        group by 1, 2, 3""")}
    for t in sample:
        for stop in t[2]:
            name = stops["stations"][stop[0]]
            x = mine_stop.get((t[0], t[1], name))
            what = f"{t[0]} {t[1]} at {name}"
            if x is None:
                rep.fail("stops.json", f"{what}: no rows in the recompute")
                continue
            rep.same("stops.json", f"{what} runs", stop[3], x["runs"])
            rep.same("stops.json", f"{what} measured", stop[4], x["measured"])
            if stop[5] is not None:
                rep.same("stops.json", f"{what} late", stop[5], x["late"])
                rep.same("stops.json", f"{what} avg", stop[6], x["a"])
            rep.same("stops.json", f"{what} cancelled", stop[7], x["canc"])

    # ------------------------------------------------------------ routes.json
    routes = json.loads((data / "routes.json").read_text())
    names = sorted({r["from"] for r in routes["routes"]} | {r["to"] for r in routes["routes"]})
    # The page names are short forms ("Berlin Hbf"); find the source names that shorten to them by asking the file's own
    # pairs: every station name of a long-distance ride, shortened the documented way (routes.py short(), lib/routeSlug.ts).
    def short(n):
        n = n.replace("Hauptbahnhof", "Hbf")
        if n == "Frankfurt am Main Flughafen Fernbahnhof":
            return "Frankfurt Flughafen"
        n = n.replace("Frankfurt (Main) ", "Frankfurt ")
        for suffix in (" (Westf)", " (Breisgau)", " (Saale)", " (Oder)"):
            n = n.replace(suffix, "")
        return n
    # Stations with the page rule's runs (majorRuns), so a short name maps to the same source name as the pipeline's.
    major = [r[0] for r in con.execute(f"""select name from ld join ld_ride using (ride) group by name
                                           having count(distinct ride) >= {routes['params']['majorRuns']}""").fetchall()]
    full = defaultdict(list)
    for n in major:
        full[short(n)].append(n)
    # Two source spellings can shorten to the same name; then every combination is a candidate and the busiest one
    # (most measured trips) is the page's pair, as only that one can pass the page rule.
    con.execute("create table rp0(a varchar, b varchar, slug varchar)")
    pairs = []
    for r in routes["routes"]:
        fa, fb = full.get(r["from"], []), full.get(r["to"], [])
        if not fa or not fb:
            rep.fail("routes.json", f"{r['slug']}: no station with {routes['params']['majorRuns']} runs is called {r['from']} / {r['to']}")
        pairs += [(a, b, r["slug"]) for a in fa for b in fb if a != b]
    con.executemany("insert into rp0 values (?, ?, ?)", pairs)
    # Per ride and station: earliest planned departure; the last row there by planned time (then stop number).
    con.execute("""
    create table ra as select ride, name, min(dp) dp from ld join ld_ride using (ride)
    where dp is not null and name in (select a from rp0) group by ride, name""")
    con.execute("""
    create table rb as select ride, name, ad, ca or cd canc, ap, coalesce(ap, dp) t from ld join ld_ride using (ride)
    where name in (select b from rp0)
    qualify row_number() over (partition by ride, name order by coalesce(ap, dp) desc nulls last, seq desc) = 1""")
    m_ok = f"not rb.canc and rb.ap is not null and rb.ad between {lo} and {hi}"
    if len(pairs) > len(routes["routes"]):
        con.execute(f"""
        create table rp as select a, b, slug from (
          select *, row_number() over (partition by slug order by n desc) k from (
            select rp0.a, rp0.b, rp0.slug, count(*) filter (where {m_ok}) n
            from rp0 join ra on ra.name = rp0.a join rb on rb.ride = ra.ride and rb.name = rp0.b and rb.t > ra.dp group by 1, 2, 3))
        where k = 1""")
    else:
        con.execute("create table rp as select * from rp0")
    con.execute(f"""
    create table rt as
    select rp.slug, x.tt, x.num, ra.dp, rb.ap, rb.ad, rb.canc, {m_ok} m
    from rp join ra on ra.name = rp.a join rb on rb.ride = ra.ride and rb.name = rp.b and rb.t > ra.dp
    join ld_ride x on x.ride = ra.ride""")
    tot = {r["slug"]: r for r in q(con, f"""
        select slug, count(*) runs, count(*) filter (where m) trips, 100.0 * count(*) filter (where m and ad >= {late}) / count(*) filter (where m) late,
          100.0 * count(*) filter (where m and ad >= 6) / count(*) filter (where m) late6, avg(ad) filter (where m) a,
          100.0 * count(*) filter (where canc) / count(*) canc
        from rt group by slug""")}
    per_train = {(r["slug"], r["tt"], r["num"]): r for r in q(con, f"""
        select slug, tt, num, count(*) filter (where m) measured, 100.0 * count(*) filter (where m and ad >= {late}) / nullif(count(*) filter (where m), 0) late,
          avg(ad) filter (where m) a from rt group by 1, 2, 3""")}
    for r in routes["routes"]:
        x = tot.get(r["slug"])
        if x is None:
            rep.fail("routes.json", f"{r['slug']}: no runs in the recompute")
            continue
        for k, v in (("runs", "runs"), ("trips", "trips"), ("late", "late"), ("late6", "late6"), ("avg", "a"), ("canc", "canc")):
            rep.same("routes.json", f"{r['slug']} {k}", r[k], x[v])
        for row in r["list"]:
            what = f"{r['slug']} {row[0]} {row[1]}"
            if (row[3] - row[2]) % 1440 > 720:
                rep.fail("routes.json: no row runs the other way", f"{what} {row[2] // 60:02d}:{row[2] % 60:02d} -> {row[3] // 60:02d}:{row[3] % 60:02d}")
            else:
                rep.fam["routes.json: no row runs the other way"][0] += 1
            y = per_train.get((r["slug"], row[0], row[1]))
            if y is None or y["measured"] != row[5]:
                rep.fail("routes.json: no row runs the other way", f"{what}: {row[5]} measured runs on the row, {y and y['measured']} A -> B by planned time")
                continue
            rep.same("routes.json", f"{what} measured", row[5], y["measured"])
            if row[4] is not None:
                rep.same("routes.json", f"{what} late", row[4], y["late"])
                rep.same("routes.json", f"{what} avg", row[6], y["a"])

    # ------------------------------------------------------------ connections.json (two busiest stations)
    conn = json.loads((data / "connections.json").read_text())
    pc = conn["params"]
    # Neighbouring stops of every window ride (to tell a real change from the same train turning round).
    con.execute("""
    create table cx as
    select ld.*, x.tt || ' ' || x.num tr, lag(name) over (partition by ride order by seq) prv,
      lead(name) over (partition by ride order by seq) nxt
    from ld join ld_ride x using (ride)""")
    walk = pc["walk"]
    okc = ", ".join(f"count(*) filter (where not bc and ch >= {w}) ok{w}" for w in walk)
    for s in sorted(conn["stations"], key=lambda s: -s["runs"])[:2]:
        rows = q(con, f"""
        with here as (select * from cx where name = ?),
             a as (select ride, tr, ap, ac, prv, nxt from here where ap is not null and ac is not null and not ca),
             b as (select ride, tr, dp, dc, cd bc, nxt from here where dp is not null and dc is not null),
             j as (select a.tr atr, b.tr btr, date_diff('minute', a.ap, b.dp) gap, date_diff('minute', a.ac, b.dc) ch, b.bc
                   from a join b on a.ride <> b.ride and b.dp >= a.ap + interval {pc['minGap']} minute and b.dp <= a.ap + interval {pc['maxGap']} minute
                   where b.nxt is distinct from a.prv and b.nxt is distinct from a.nxt and a.tr <> b.tr and not (b.nxt is null and b.bc)),
             ghosts as (select atr, btr, gap from j group by 1, 2, 3 having count(*) filter (where bc) = count(*) and count(*) >= 20)
        select gap, count(*) n, count(*) filter (where bc) canc, {okc} from j anti join ghosts using (atr, btr, gap)
        group by gap having count(*) >= {pc['minN']} order by gap""", [s["name"]])
        mine = [[int(r["gap"]), r["n"], r["canc"]] + [r[f"ok{w}"] for w in walk] for r in rows]
        rep.fam["connections.json"][0] += 1
        if mine != s["gaps"]:
            diff = [(a, b) for a, b in zip(s["gaps"], mine) if a != b][:3]
            rep.fail("connections.json", f"{s['name']}: ladder differs ({len(s['gaps'])} vs {len(mine)} gaps) {diff}")
        else:
            rep.fam["connections.json"][0] += len(mine) * (3 + len(walk))

    # ------------------------------------------------------------ compensation.json
    comp = json.loads((data / "compensation.json").read_text())
    nw = q(con, f"""select count(*) runs, count(*) filter (where all_canc) cancelled, count(*) filter (where ok) measured,
                     count(*) filter (where ok and delay >= 15) n15, count(*) filter (where ok and delay >= 60) n60,
                     count(*) filter (where ok and delay >= 120) n120 from ld_ride""")[0]
    for k in ("runs", "cancelled", "measured", "n15", "n60", "n120"):
        rep.same("compensation.json", f"network {k}", comp["network"][k], nw[k])
    cm = {r["month"]: r for r in q(con, """select month, count(*) filter (where ok) m, 100.0 * count(*) filter (where ok and delay >= 60) / count(*) filter (where ok) p60,
                                            100.0 * count(*) filter (where ok and delay >= 120) / count(*) filter (where ok) p120 from ld_ride group by month""")}
    for m in comp["monthly"]:
        x = cm.get(m["month"], {})
        rep.same("compensation.json", f"{m['month']} measured", m["measured"], x.get("m"))
        rep.same("compensation.json", f"{m['month']} p60", m["p60"], x.get("p60"))
        rep.same("compensation.json", f"{m['month']} p120", m["p120"], x.get("p120"))
    ty = {r["tt"]: r for r in q(con, """select tt, count(*) filter (where ok) m, 100.0 * count(*) filter (where ok and delay >= 60) / count(*) filter (where ok) p60
                                         from ld_ride group by tt""")}
    for t, v in comp["types"].items():
        rep.same("compensation.json", f"type {t} measured", v["measured"], ty.get(t, {}).get("m"))
        rep.same("compensation.json", f"type {t} p60", v["p60"], ty.get(t, {}).get("p60"))

    bad = rep.done()
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
