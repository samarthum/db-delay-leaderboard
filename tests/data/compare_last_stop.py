#!/usr/bin/env python3
"""Before/after of the Nov 2026 last-stop fix (PR dry run and the recompute run): what moves, and by how much.

  python tests/data/compare_last_stop.py --parquet DIR --old OLD_DATA_DIR [--new data] [--examples 10]

The site measured a run at its last stop BY STOP NUMBER; since Nov 2026 by PLANNED TIME, then stop number, with a station
listed twice at the same planned times counted once (lowest stop number). Rows numbered 100+ are appended after the
planned list (diversions, duplicate stations), so the highest number can be a mid-route stop.

A. Run level, straight from the Parquet (the old window's months), both rules side by side in one query of its own:
   runs whose measured stop or delay moves; the headline (last 3 months) before/after, with "before" checked against the
   committed stats.json (so "before" is what the site shows); per long-distance train (20+ measured runs) the average
   before/after: distribution of the move and the 10 biggest movers, each with the raw stop rows of its most-changed run
   (old and new measured stop marked) to check by hand.
B. File level, when OLD and NEW cover the same window: how many figures of each file family changed and the largest move.

Prints Markdown (the workflow appends it to the job summary). Diagnostic: exits 0 unless the input is unusable.
"""
import argparse
import json
from collections import Counter
from pathlib import Path

import duckdb

PREFIX = r"regexp_extract(id, '^(.*-[0-9]{10})-[0-9]+$', 1)"
BUCKETS = [(0, "0 (no change)"), (0.05, "under 0.1"), (0.5, "0.1-0.5"), (1, "0.5-1"), (2, "1-2"), (5, "2-5"), (1e9, "5+")]


def bucket(x):
    x = abs(x)
    if x < 1e-9:
        return BUCKETS[0][1]
    for hi, label in BUCKETS[1:]:
        if x < hi:
            return label
    return BUCKETS[-1][1]


def load(folder, name):
    p = Path(folder) / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def run_level(a, stats):
    months = [m for m in stats["window"]["months"] if (Path(a.parquet) / f"data-{m}.parquet").exists()]
    if months != stats["window"]["months"]:
        print(f"(old window months missing from {a.parquet}: {sorted(set(stats['window']['months']) - set(months))}; "
              "run-level figures use the months present)\n")
    p = stats["params"]
    lo, hi = p["clampMinMinutes"], p["clampMaxMinutes"]
    ld = "(" + ", ".join(f"'{t}'" for t in p["longDistanceTypes"]) + ")"
    prefixes = "(" + ", ".join(f"'{t}'" for t in p["regionalLinePrefixes"]) + ")"
    src = "[" + ", ".join(f"'{Path(a.parquet) / f'data-{m}.parquet'}'" for m in months) + "]"
    con = duckdb.connect()
    con.execute(f"set memory_limit = '{a.memory_limit}'; set preserve_insertion_order = false")
    # Every stop row with `low`: the lowest stop number of its (ride, station name, planned times) group. The old rule reads all
    # rows by stop number; the new rule reads rows with seq = low by (planned time, stop number).
    con.execute(f"""
    create table runs as
    select ride, any_value(cat) cat, any_value(unit) unit, min(coalesce(dp, ap)) start,
      bool_and(canc) canc_old, bool_and(canc) filter (where seq = low) canc_new,
      arg_max({{'d': ad, 'seq': seq, 'name': name}}, seq) filter (where m) op,
      arg_max({{'d': ad, 'seq': seq, 'name': name}}, epoch(ap)::bigint * 100000 + seq) filter (where m and seq = low) np
    from (
      select *, min(seq) over (partition by ride, name, ap, dp) low,
        not canc and ap is not null and ad is not null m
      from (
        select {PREFIX} ride, case when train_type in {ld} then 'longDistance' else 'regional' end cat,
          case when train_type in {ld} then train_type || ' ' || train_number end unit,
          train_line_station_num seq, eva, station_name name, arrival_is_canceled or departure_is_canceled canc,
          arrival_planned_time ap, departure_planned_time dp,
          date_diff('minute', arrival_planned_time, arrival_change_time) ad
        from read_parquet({src})
        where not is_replacement_train and (train_type in {ld} or (train_type <> 'Bus'
          and regexp_extract(coalesce(line_number, ''), '^([A-Z]+)[0-9]', 1) in {prefixes}))))
    group by ride
    having strftime(min(coalesce(dp, ap)), '%Y-%m') in ({', '.join(repr(m) for m in months)})""")
    con.execute(f"""create table rv as select *, strftime(start, '%Y-%m') AS month,
      case when op.d between {lo} and {hi} then op.d end d_old, case when np.d between {lo} and {hi} then np.d end d_new
      from runs""")

    print("#### A. Run level (from the Parquet, both rules)\n")
    print("| category | runs | measured stop moves | of which a row numbered 100+ was picked before | delay changes | "
          "measured before -> after | fully cancelled before -> after |")
    print("|---|---:|---:|---:|---:|---:|---:|")
    for r in con.execute("""
        select cat, count(*), count(*) filter (where op.seq is distinct from np.seq),
          count(*) filter (where op.seq is distinct from np.seq and op.seq >= 100),
          count(*) filter (where d_old is distinct from d_new),
          count(d_old), count(d_new), count(*) filter (where canc_old), count(*) filter (where canc_new)
        from rv group by cat order by cat""").fetchall():
        print(f"| {r[0]} | {r[1]:,} | {r[2]:,} ({100 * r[2] / r[1]:.2f}%) | {r[3]:,} | {r[4]:,} ({100 * r[4] / r[1]:.2f}%) | "
              f"{r[5]:,} -> {r[6]:,} | {r[7]:,} -> {r[8]:,} |")

    hm = stats["headline"]["months"]
    print(f"\nHeadline ({hm[0]}..{hm[-1]}): before = stop-number rule (checked against the committed stats.json), "
          "after = planned-time rule\n")
    print("| category | avg before | avg after | 15+ before | 15+ after | 6+ before | 6+ after | measured before -> after | "
          "stats.json avg (= before?) |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    ok_before = True
    for r in con.execute(f"""
        select cat, avg(d_old), avg(d_new), 100.0 * avg((d_old >= 15)::int), 100.0 * avg((d_new >= 15)::int),
          100.0 * avg((d_old >= 6)::int), 100.0 * avg((d_new >= 6)::int), count(d_old), count(d_new)
        from rv where month in ({', '.join(repr(m) for m in hm)}) group by cat order by cat""").fetchall():
        live = stats["headline"]["categories"].get(r[0], {}).get("avgDelayMin")
        same = live is not None and abs(live - r[1]) <= 0.05
        ok_before &= same
        print(f"| {r[0]} | {r[1]:.2f} | {r[2]:.2f} | {r[3]:.2f}% | {r[4]:.2f}% | {r[5]:.2f}% | {r[6]:.2f}% | "
              f"{r[7]:,} -> {r[8]:,} | {live} ({'yes' if same else 'NO'}) |")
    if not ok_before:
        print("\n(\"before\" does not match the committed stats.json: the committed files were not computed with the old "
              "rule on these months; compare with care)")

    # Per long-distance train: the window average before/after.
    units = con.execute(f"""
        select unit, count(d_old) n_old, avg(d_old) a_old, count(d_new) n_new, avg(d_new) a_new,
          count(*) filter (where d_old is distinct from d_new) moved
        from rv where cat = 'longDistance' group by unit
        having count(d_old) >= {p['searchMinRuns']} or count(d_new) >= {p['searchMinRuns']}""").fetchall()
    dist = Counter(bucket((x[4] or 0) - (x[2] or 0)) for x in units)
    print(f"\nLong-distance trains with {p['searchMinRuns']}+ measured runs: {len(units):,}; window average moves by "
          "(minutes):\n")
    print("| move | trains |")
    print("|---|---:|")
    for _, label in BUCKETS:
        print(f"| {label} | {dist.get(label, 0):,} |")
    top = sorted(units, key=lambda x: -abs((x[4] or 0) - (x[2] or 0)))[:a.examples]
    print(f"\n{a.examples} biggest movers (runs measured, average; runs whose delay changed):\n")
    print("| train | before | after | runs changed |")
    print("|---|---:|---:|---:|")
    for u, n_old, a_old, n_new, a_new, moved in top:
        print(f"| {u} | {n_old:,}, {a_old:.1f} min | {n_new:,}, {a_new:.1f} min | {moved:,} |")
    print("\nRaw stop rows of each mover's most-changed run (`old` = measured by stop number, `new` = by planned time; "
          "`dup` = dropped as a station listed twice at the same planned times):\n")
    picks = {}
    for u, *_ in top:
        ride = con.execute("""select ride from rv where unit = ? and (d_old is distinct from d_new)
                              order by abs(coalesce(d_new, 0) - coalesce(d_old, 0)) desc, ride limit 1""", [u]).fetchone()
        if ride:
            picks[u] = ride[0]
    raw = {}
    if picks:
        ids = ", ".join(repr(r) for r in picks.values())
        for row in con.execute(f"""
                select {PREFIX} ride, train_line_station_num, station_name, arrival_planned_time, departure_planned_time,
                  arrival_change_time, arrival_is_canceled or departure_is_canceled,
                  min(train_line_station_num) over (partition by {PREFIX}, station_name, arrival_planned_time, departure_planned_time)
                from read_parquet({src}) where {PREFIX} in ({ids})
                order by coalesce(arrival_planned_time, departure_planned_time), train_line_station_num""").fetchall():
            raw.setdefault(row[0], []).append(row[1:])
    print("```")
    for u, ride in picks.items():
        r = con.execute("select start, op, np, d_old, d_new from rv where ride = ?", [ride]).fetchone()
        print(f"{u} {r[0]:%Y-%m-%d %H:%M}: before {r[3]} min at {r[1] and r[1]['name']} (stop {r[1] and r[1]['seq']}), "
              f"after {r[4]} min at {r[2] and r[2]['name']} (stop {r[2] and r[2]['seq']})")
        for seq, name, ap, dp, ac, canc, low in raw.get(ride, []):
            mark = " ".join(x for x, hit in (("old", r[1] and seq == r[1]["seq"]), ("new", r[2] and seq == r[2]["seq"]),
                                             ("dup", seq != low)) if hit)
            print(f"  {seq:4} {name[:32]:32} arr {str(ap or ''):19} dep {str(dp or ''):19} arr real {str(ac or ''):19}"
                  f"{' cancelled' if canc else ''}  {mark}")
    print("```\n")


def file_level(a):
    so, sn = load(a.old, "stats.json"), load(a.new, "stats.json")
    if so is None or sn is None:
        return
    if so["window"]["months"] != sn["window"]["months"]:
        print(f"#### B. Files: windows differ ({so['window']['firstMonth']}..{so['window']['lastMonth']} -> "
              f"{sn['window']['firstMonth']}..{sn['window']['lastMonth']}), so file changes mix the new month and the fix; "
              "see part A for the fix alone.\n")
        return
    rows = []

    def tally(family, pairs):
        """pairs: [(old, new)] numbers; count differing values and the largest move."""
        pairs = [(x, y) for x, y in pairs if x is not None or y is not None]
        diff = [(x, y) for x, y in pairs if x != y]
        big = max((abs((y or 0) - (x or 0)) for x, y in diff), default=0)
        rows.append((family, len(pairs), len(diff), big))

    ho, hn = so["headline"]["categories"], sn["headline"]["categories"]
    for cat in ho:
        tally(f"headline {cat}", [(ho[cat][k], hn[cat][k]) for k in ("avgDelayMin", "measured", "fullCancelPct")]
              + [(x["share"], y["share"]) for x, y in zip(ho[cat]["bands"], hn[cat]["bands"])])
    mo, mn = load(a.old, "monthly.json"), load(a.new, "monthly.json")
    for cat in mo["series"]:
        tally(f"monthly.json {cat} (avg per month)", [(x["avgDelayMin"], y["avgDelayMin"]) for x, y in zip(mo["series"][cat], mn["series"][cat])])
        tally(f"monthly.json {cat} (runs per month)", [(x["runs"], y["runs"]) for x, y in zip(mo["series"][cat], mn["series"][cat])])

    def search(folder):
        out = {}
        for p in sorted((Path(folder) / "search").glob("s-*.json")):
            for r in json.loads(p.read_text(encoding="utf-8")):
                out[(r[2], r[0], r[1], r[13] if len(r) > 13 else None)] = r
        return out
    uo, un = search(a.old), search(a.new)
    for kind, label in ((0, "search: trains"), (1, "search: lines"), (2, "search: regional numbers")):
        both = [k for k in uo if k[0] == kind and k in un]
        tally(f"{label} (average)", [(uo[k][5], un[k][5]) for k in both])
        tally(f"{label} (15+ share)", [(uo[k][6], un[k][6]) for k in both])
        tally(f"{label} (measured runs)", [(uo[k][4], un[k][4]) for k in both])
    for folder in ("trains", "lines"):
        pairs = []
        for p in sorted((Path(a.old) / folder).glob("*.json")):
            q = Path(a.new) / folder / p.name
            if q.exists():
                x, y = json.loads(p.read_text(encoding="utf-8")), json.loads(q.read_text(encoding="utf-8"))
                pairs.append((x["minutes"]["avg"], y["minutes"]["avg"]))
        tally(f"{folder} pages (average)", pairs)
    ro = {r["slug"]: r for r in load(a.old, "routes.json")["routes"]}
    rn = {r["slug"]: r for r in load(a.new, "routes.json")["routes"]}
    both = sorted(set(ro) & set(rn))
    for k in ("trips", "late", "avg", "canc"):
        tally(f"routes.json ({k})", [(ro[s][k], rn[s][k]) for s in both])
    co, cn = load(a.old, "compensation.json"), load(a.new, "compensation.json")
    tally("compensation.json network", [(co["network"][k], cn["network"][k]) for k in co["network"]])
    tally("compensation.json per month", [(x[k], y[k]) for x, y in zip(co["monthly"], cn["monthly"]) for k in ("measured", "p60", "p120")])
    tally("compensation.json per type", [(co["types"][t][k], cn["types"][t][k]) for t in co["types"] if t in cn["types"] for k in ("measured", "p60", "p120")])
    tally("compensation.json routes", [(x, y) for s in co["routes"] if s in cn["routes"] for x, y in zip(co["routes"][s], cn["routes"][s])])
    sto, stn = load(a.old, "stops.json"), load(a.new, "stops.json")

    def stop_map(doc):
        return {(t[0], t[1], doc["stations"][x[0]]): x for t in doc["trains"] for x in t[2]}
    mo_, mn_ = stop_map(sto), stop_map(stn)
    both = [k for k in mo_ if k in mn_]
    tally("stops.json (runs per stop)", [(mo_[k][3], mn_[k][3]) for k in both])
    tally("stops.json (average per stop)", [(mo_[k][6], mn_[k][6]) for k in both])
    po, pn = load(a.old, "connection-pairs.json"), load(a.new, "connection-pairs.json")
    trains = [t for t in po if t in pn]
    order = lambda t, d: sorted(d[t]["s"], key=lambda n: (d[t]["s"][n]["i"], n))
    rows.append(("connection-pairs: trains whose station order changed", len(trains),
                 sum(1 for t in trains if [n for n in order(t, po) if n in pn[t]["s"]] != [n for n in order(t, pn) if n in po[t]["s"]]), 0))
    rows.append(("connection-pairs: trains whose ends changed", len(trains),
                 sum(1 for t in trains if (po[t]["o"], po[t]["d"]) != (pn[t]["o"], pn[t]["d"])), 0))
    print("#### B. Files (same window): figures that changed\n")
    print("| family | values | changed | largest move |")
    print("|---|---:|---:|---:|")
    for fam, n, d, big in rows:
        print(f"| {fam} | {n:,} | {d:,} | {big:g} |")
    print()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", required=True)
    ap.add_argument("--old", required=True, help="the data folder before the run (committed files)")
    ap.add_argument("--new", default="data")
    ap.add_argument("--examples", type=int, default=10)
    ap.add_argument("--memory-limit", default="8GB")
    a = ap.parse_args()
    print("### Last stop by planned time: before / after\n")
    run_level(a, load(a.old, "stats.json"))
    file_level(a)


if __name__ == "__main__":
    main()
