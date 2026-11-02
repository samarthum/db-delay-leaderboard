#!/usr/bin/env python3
"""Recompute the home page headline from the Parquet files with a separate query and compare it with data/stats.json.

The query shares no code with compute.py: it picks each run's last measured stop with a window function
instead of an aggregate, and selects trains with its own filters. Same rule: stops in order of planned time (then stop
number; rows numbered 100+ sit mid-route), a station listed twice at the same planned times counted once (the row with
the lowest stop number), here by grouping instead of compute.py's window. Exits 1 when a number differs by more
than the tolerance.

  python scripts/check_headline.py --data-dir DIR
"""
import argparse
import json
import sys
from pathlib import Path

import duckdb

TOLERANCE = 0.1  # minutes or percentage points


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data-dir", required=True, help="folder with data-YYYY-MM.parquet files")
    ap.add_argument("--stats", default="data/stats.json")
    args = ap.parse_args()

    stats = json.loads(Path(args.stats).read_text())
    months, p = stats["headline"]["months"], stats["params"]
    files = [str(Path(args.data_dir) / f"data-{m}.parquet") for m in months]
    long_types = ", ".join(f"'{t}'" for t in p["longDistanceTypes"])
    prefixes = "|".join(p["regionalLinePrefixes"])
    lo, hi = p["clampMinMinutes"], p["clampMaxMinutes"]

    con = duckdb.connect()
    con.execute("set memory_limit = '3GB'")
    got = {r[0]: r[1:] for r in con.execute(f"""
    with raw as (
      select regexp_extract(id, '^(.*-\\d{{10}})-\\d+$', 1) trip, train_line_station_num pos, eva,
        case when train_type in ({long_types}) then 'longDistance'
             when train_type <> 'Bus' and regexp_matches(coalesce(line_number, ''), '^({prefixes})[0-9]') then 'regional'
        end kind,
        arrival_is_canceled or departure_is_canceled dropped,
        coalesce(departure_planned_time, arrival_planned_time) planned, departure_planned_time dep,
        arrival_planned_time arr, date_diff('minute', arrival_planned_time, arrival_change_time) late
      from read_parquet({files!r})
      where not is_replacement_train),
    -- one row per (trip, station, planned times): the whole row with the lowest stop number (a struct, as arg_min()
    -- skips NULL values and separate columns could come from different rows)
    stops as (
      select trip, pos, x.kind, x.dropped, planned, arr, x.late from (
        select trip, min(pos) pos, arg_min({{'kind': kind, 'dropped': dropped, 'late': late}}, pos) x,
          any_value(planned) planned, arr
        from raw group by trip, eva, arr, dep)),
    trips as (
      select trip, any_value(kind) kind, min(planned) start, bool_and(dropped) cancelled from stops
      where kind is not null group by trip),
    last_stop as (
      select trip, late from stops
      where kind is not null and not dropped and arr is not null and late is not null
      qualify row_number() over (partition by trip order by arr desc, pos desc) = 1)
    select kind, avg(late) filter (where late between {lo} and {hi}),
      100 * avg((late >= 15)::int) filter (where late between {lo} and {hi}),
      100 * avg(cancelled::int), count(*) filter (where late between {lo} and {hi})
    from trips left join last_stop using (trip)
    where strftime(start, '%Y-%m') in (select unnest({months!r}))
    group by kind""").fetchall()}

    failed = False
    for kind, h in stats["headline"]["categories"].items():
        late15 = sum(b["share"] for b in h["bands"] if b["lo"] is not None and b["lo"] >= 15)
        avg, share15, cancelled, measured = got[kind]
        for name, ours, theirs in [("average delay (min)", h["avgDelayMin"], avg),
                                   ("15+ min late (%)", late15, share15),
                                   ("cancelled (%)", h["fullCancelPct"], cancelled)]:
            ok = abs(ours - theirs) <= TOLERANCE
            failed |= not ok
            print(f"{kind:12} {name:20} stats.json {ours:7.2f}  check {theirs:7.2f}  {'ok' if ok else 'DIFFERS'}")
        print(f"{kind:12} {'measured trips':20} stats.json {h['measured']:7d}  check {measured:7d}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
