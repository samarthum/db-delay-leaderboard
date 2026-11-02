#!/usr/bin/env python3
"""Does scripts/last7.py measure a day the way the site's 11-month history does? Proof on real data (PR dry run).

The history comes from piebro's monthly processed files (`monthly_processed_data/data-YYYY-MM.parquet`), which piebro
builds from the same raw answers last7.py reads. This script runs last7.py's own per-run logic (extract +
compute_runs) on the raw files of a past week, reads the same week's rides from the monthly file with a separate query
(first stop with a planned departure, last stop with a planned arrival, by planned time then stop number, a station
listed twice at the same planned times counted once; compute.py's types; no replacement trains), and compares per ride: departure delay at the first stop, arrival delay at the last stop
("x" when that stop is cancelled), and which station each end is.

  python tests/data/compare_monthly.py --first 2026-09-08 [--days 7] --cache DIR [--min-exact 0.98]
  python tests/data/compare_monthly.py --first 2026-09-08 --raw DIR --monthly FILE      # local files

Exit 1 when the exact agreement is below --min-exact. Why 98%: the two sides run the same merge on the same answers,
so the only honest differences are raw files repaired or re-uploaded after piebro built the monthly file and the
latest change record of a stop falling outside the folders read here (one extra day either side keeps that near 0).
A real rule difference is far bigger: counting stops without a change record as unmeasured, or the old "missing
hours" rule, changes tens of percent of the cells.

Since Nov 2026 both sides pick the ends by planned time, then stop number (the site's rule, compute.py): piebro's files
hold the stop rows, not a rule, so the monthly side here applies the same rule with its own query. `--stop-number-rule`
reports how many ends the old "by stop number" rule would put elsewhere (rows numbered 100+, duplicate stations).
"""
import argparse
import re
import sys
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import last7  # noqa: E402


def monthly_remote(month):
    """(path, size) of piebro's monthly processed file for 'YYYY-MM'."""
    url = last7.HF_TREE + urllib.parse.quote("monthly_processed_data", safe="/=")
    while url:
        entries, headers = last7.get_json(url)
        for e in entries:
            if e.get("path", "").endswith(f"data-{month}.parquet"):
                return e["path"], int(e.get("size") or 0)
        m = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link") or "")
        url = m.group(1) if m else None
    sys.exit(f"no monthly file for {month}")


def monthly_rides(path, lo, hi, old_rule=False):
    """{ride: (unit, start, dep, arr)} from the monthly file; dep/arr = (eva, delay, cancelled) or None.

    old_rule: the ends by stop number alone, no duplicate stops dropped (the rule before Nov 2026; for the report)."""
    types = ", ".join(repr(t) for t in last7.LONG_DISTANCE)
    con = duckdb.connect()
    rows = con.execute(f"""
    with s0 as (
      select regexp_extract(id, '^(.*-\\d{{10}})-\\d+$', 1) ride, train_line_station_num seq,
        train_type tt, train_number num, eva, station_name name,
        arrival_planned_time ap, arrival_change_time ac, departure_planned_time dp, departure_change_time dc,
        arrival_is_canceled xa, departure_is_canceled xd
      from read_parquet(?) where train_type in ({types}) and not is_replacement_train),
    -- a station listed twice at the same planned times is one stop: the lowest stop number (skipped for the old rule)
    s as (select s0.* from s0 left join (select ride, name, ap, dp, min(seq) low from s0 group by all) k
          on k.ride = s0.ride and k.name is not distinct from s0.name and k.ap is not distinct from s0.ap
          and k.dp is not distinct from s0.dp
          where {"true" if old_rule else "s0.seq = k.low"}),
    starts as (select ride, any_value(tt) tt, any_value(num) num, min(coalesce(dp, ap)) t0 from s where ride <> ''
               group by ride having t0 >= ? and t0 < ?),
    d as (select ride, eva, date_diff('minute', dp, dc) delay, xd canc from s where dp is not null
          qualify row_number() over (partition by ride order by {"seq" if old_rule else "coalesce(ap, dp), seq"}) = 1),
    a as (select ride, eva, date_diff('minute', ap, ac) delay, xa canc from s where ap is not null
          qualify row_number() over (partition by ride order by {"seq desc" if old_rule else "ap desc, seq desc"}) = 1)
    select starts.ride, tt, num, t0, d.eva, d.delay, d.canc, a.eva, a.delay, a.canc
    from starts left join d using (ride) left join a using (ride)
    """, [str(path), lo, hi]).fetchall()
    out = {}
    for ride, tt, num, t0, de, dd, dx, ae, ad, ax in rows:
        out[ride] = (f"{tt} {num}", t0, None if de is None else (de, dd, bool(dx)), None if ae is None else (ae, ad, bool(ax)))
    return out


def value(end):
    if end is None:
        return None
    return "x" if end[2] else end[1]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--first", required=True, help="first service day (Berlin), e.g. 2026-09-08")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--cache", help="download folder")
    ap.add_argument("--raw", help="local raw_data tree instead of downloading")
    ap.add_argument("--monthly", help="local monthly processed file instead of downloading")
    ap.add_argument("--names", help="eva -> station name JSON")
    ap.add_argument("--min-exact", type=float, default=0.98)
    a = ap.parse_args()

    first = date.fromisoformat(a.first)
    days = [first + timedelta(days=i) for i in range(a.days)]
    if days[0].month != days[-1].month:
        sys.exit("keep the week inside one month (one monthly file)")
    cache = Path(a.cache or "/tmp/gp-compare")
    if a.raw:
        files = last7.local_files(a.raw)
    else:
        # Same reach as the daily job: a UTC fetch-day folder before the first day and one after the last.
        folders = [days[0] - timedelta(days=1) + timedelta(days=i) for i in range(a.days + 2)]
        listing = last7.list_remote(folders)
        last7.log(f"raw files: {len(listing)} in {len(folders)} day folders, {sum(s for _, s in listing) / 1e9:.2f} GB")
        files = [last7.download(rel, size, cache) for rel, size in listing]
    files.sort(key=lambda p: (last7.folder_day(p), p.name))
    if a.monthly:
        monthly = Path(a.monthly)
    else:
        rel, size = monthly_remote(f"{days[0]:%Y-%m}")
        monthly = last7.download(rel, size, cache)

    names = last7.load_names(a.names)
    plan, fchg, snaps = last7.extract(files, names, last7.timezone.utc)
    missing = last7.missing_hours(files, days[0], days[-1])
    ours = {r["ride"]: r for r in last7.compute_runs(plan, fchg, days, missing)}
    lo = datetime.combine(days[0], datetime.min.time())
    hi = datetime.combine(days[-1] + timedelta(days=1), datetime.min.time())
    theirs = monthly_rides(monthly, lo, hi)
    by_number = monthly_rides(monthly, lo, hi, old_rule=True)
    moved = sum(1 for ride, v in theirs.items() for i in (2, 3) if ride in by_number and by_number[ride][i] != v[i])
    last7.log("fetch runs: " + ", ".join(f"{r:%d %H:%M}" for r in last7.fetch_runs(snaps)))

    both = sorted(set(ours) & set(theirs))
    only_ours = sorted(set(ours) - set(theirs))
    only_theirs = sorted(set(theirs) - set(ours))
    cells = exact = within1 = 0
    station_same = station_cells = 0
    mismatches = []
    for ride in both:
        r, (unit, t0, mdep, marr) = ours[ride], theirs[ride]
        for kind, mine, other in (("dep", r["dep"], mdep), ("arr", r["arr"], marr)):
            mv = value(None if mine is None else (mine["eva"], mine["delay"], mine["canc"]))
            tv = value(other)
            if mv is None and tv is None:
                continue
            cells += 1
            if mv == tv:
                exact += 1
                within1 += 1
            else:
                if isinstance(mv, int) and isinstance(tv, int) and abs(mv - tv) <= 1:
                    within1 += 1
                mismatches.append(f"{unit} {t0:%Y-%m-%d %H:%M} {kind} ({ride}): last7 {mv} at {mine and mine['eva']}"
                                  f"{' [?]' if r['gap'] else ''}, monthly {tv} at {other and other[0]}")
            if mine is not None and other is not None:
                station_cells += 1
                station_same += mine["eva"] == other[0]
    # A ride on one side only counts as two mismatched cells: the denominator covers every ride either side measured.
    total = cells + 2 * (len(only_ours) + len(only_theirs))
    rate = exact / total if total else 0.0
    gaps = sum(1 for r in ours.values() if r["gap"])
    published = [r for r in ours.values() if not r["gap"]]

    print(f"compare_monthly: days {days[0]}..{days[-1]}, {len(files)} raw files, {len(missing)} plan hours missing")
    print(f"rides: last7 {len(ours)} ({gaps} would show '?'), monthly {len(theirs)}, both {len(both)}, "
          f"only last7 {len(only_ours)}, only monthly {len(only_theirs)}")
    print(f"cells compared: {cells} (+{total - cells} for rides on one side only = {total})")
    print(f"exact: {exact} ({100 * exact / max(total, 1):.2f}%), within 1 min: {within1} ({100 * within1 / max(total, 1):.2f}%), "
          f"mismatched: {total - exact}")
    print(f"same end station: {station_same} of {station_cells}")
    print(f"ends the old rule (by stop number alone) would measure differently in the monthly file: {moved} of "
          f"{2 * len(theirs)}")
    print(f"measured runs per day ('?' left out): "
          f"{[sum(1 for r in published if r['day'] == d) for d in days]}")
    for m in mismatches[:25]:
        print("MISMATCH", m)
    for ride in only_ours[:8]:
        r = ours[ride]
        print(f"ONLY LAST7 {r['unit']} {r['start']:%Y-%m-%d %H:%M} ({ride}) dep {r['dep']} arr {r['arr']}{' [?]' if r['gap'] else ''}")
    for ride in only_theirs[:8]:
        print(f"ONLY MONTHLY {theirs[ride][0]} {theirs[ride][1]:%Y-%m-%d %H:%M} ({ride}) dep {theirs[ride][2]} arr {theirs[ride][3]}")
    ok = rate >= a.min_exact
    print(f"{'OK' if ok else 'FAIL'}: exact agreement {100 * rate:.2f}% (threshold {100 * a.min_exact:.0f}%)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
