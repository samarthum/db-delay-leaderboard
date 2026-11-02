"""Why does ordering by planned time change so many routes? (PR-only diagnostic for the Nov 2026 route-direction fix.)

  python tests/data/probe_direction.py --parquet DIR --stats data/stats.json

Counts long-distance window runs whose stop numbers (train_line_station_num) disagree with their planned times, then for
a few pairs lists the runs only the old rule (stop number at A < at B) counts and the runs only the new rule (planned at
B after departing A) counts, with the stop rows of a sample of each.
"""
import argparse
import json
from pathlib import Path

import duckdb

PREFIX = r"regexp_extract(id, '^(.*-[0-9]{10})-[0-9]+$', 1)"
PAIRS = [("Stendal Hbf", "Berlin Hauptbahnhof"), ("Frankfurt am Main Flughafen Fernbahnhof", "Köln Messe/Deutz%"),
         ("Hannover Hbf", "Berlin Hauptbahnhof")]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--parquet", required=True)
    ap.add_argument("--stats", default="data/stats.json")
    ap.add_argument("--samples", type=int, default=3)
    a = ap.parse_args()
    st = json.loads(Path(a.stats).read_text())
    months = st["window"]["months"]
    ld = "(" + ", ".join(f"'{t}'" for t in st["params"]["longDistanceTypes"]) + ")"
    src = "[" + ", ".join(f"'{Path(a.parquet) / f'data-{m}.parquet'}'" for m in months) + "]"
    con = duckdb.connect()
    con.execute("set memory_limit = '6GB'")
    con.execute(f"""
    create table s as select * from (
      select {PREFIX} ride, train_type || ' ' || train_number tr, train_line_station_num seq, station_name name, eva,
        arrival_is_canceled or departure_is_canceled canc, arrival_change_time ac, departure_change_time dc,
        arrival_planned_time ap, departure_planned_time dp, coalesce(departure_planned_time, arrival_planned_time) t0,
        min(coalesce(departure_planned_time, arrival_planned_time)) over (partition by {PREFIX}) start
      from read_parquet({src}) where not is_replacement_train and train_type in {ld})
    where strftime(start, '%Y-%m') in ({', '.join(repr(m) for m in months)})""")
    n = con.execute("select count(distinct ride) from s").fetchone()[0]
    # A run is out of order when some stop has a higher number but an earlier planned time than another.
    bad = con.execute("""
    select count(*), count(*) filter (where rev) from (
      select ride, bool_or(t0 < lag_t) rev0, bool_and(t0 <= lag_t or lag_t is null) rev from (
        select ride, t0, lag(t0) over (partition by ride order by seq) lag_t from s where t0 is not null)
      group by ride having bool_or(t0 < lag_t))""").fetchone()
    print(f"window runs {n:,}; runs whose stop numbers disagree with planned times somewhere: {bad[0]:,} "
          f"({100 * bad[0] / n:.2f}%), fully reversed: {bad[1]:,}")
    dup = con.execute("select count(*) from (select ride, seq from s group by 1, 2 having count(*) > 1)").fetchone()[0]
    print(f"(ride, stop number) used twice: {dup:,}")
    # The last-stop rule's assumptions (Nov 2026): every row has a planned time; a station listed twice at the same
    # planned times is one stop (lowest stop number kept): how often do such copies disagree on cancellation or change?
    notime = con.execute("select count(*) from s where ap is null and dp is null").fetchone()[0]
    g = con.execute("""
    select count(*), count(*) filter (where nc > 1), count(*) filter (where nac > 1 or ndc > 1), sum(n - 1),
      count(*) filter (where hi >= 100)
    from (select ride, eva, ap, dp, count(*) n, count(distinct canc) nc, count(distinct ac) nac, count(distinct dc) ndc,
            max(seq) hi
          from s group by 1, 2, 3, 4 having count(*) > 1)""").fetchone()
    print(f"rows without any planned time: {notime:,}")
    print(f"stations listed twice at the same planned times: {g[0]:,} groups in {g[3] or 0:,} extra rows "
          f"({g[4]:,} with a copy numbered 100+); copies disagree on cancelled: {g[1]:,}, on the changed time: {g[2]:,}")
    for pa, pb in PAIRS:
        na = con.execute("select name from s where name like ? group by name order by count(*) desc limit 1", [pa]).fetchone()
        nb = con.execute("select name from s where name like ? group by name order by count(*) desc limit 1", [pb]).fetchone()
        if not na or not nb:
            print(f"\n{pa} -> {pb}: not found")
            continue
        na, nb = na[0], nb[0]
        con.execute("""
        create or replace temp table j as
        with a as (select ride, min(seq) aseq, min(dp) adp from s where name = ? and dp is not null group by ride),
             b_seq as (select ride, seq bseq from s where name = ? qualify row_number() over (partition by ride order by seq desc) = 1),
             b_t as (select ride, coalesce(ap, dp) bt from s where name = ?
                     qualify row_number() over (partition by ride order by coalesce(ap, dp) desc nulls last, seq desc) = 1)
        select a.ride, a.aseq < b_seq.bseq old_rule, b_t.bt > a.adp new_rule from a join b_seq using (ride) join b_t using (ride)""",
                    [na, nb, nb])
        c = con.execute("""select count(*) filter (where old_rule), count(*) filter (where new_rule),
                             count(*) filter (where old_rule and not new_rule), count(*) filter (where new_rule and not old_rule) from j""").fetchone()
        print(f"\n{na} -> {nb}: old rule {c[0]:,} runs, new rule {c[1]:,}; only old {c[2]:,}, only new {c[3]:,}")
        for label, cond in (("only old", "old_rule and not new_rule"), ("only new", "new_rule and not old_rule")):
            for (ride,) in con.execute(f"select ride from j where {cond} order by ride limit {a.samples}").fetchall():
                rows = con.execute("select seq, name, tr, ap, dp from s where ride = ? order by seq", [ride]).fetchall()
                print(f"  {label}: {rows[0][2]} ride {ride[-24:]}")
                for seq, name, tr, ap_, dp_ in rows:
                    mark = " <" if name in (na, nb) else ""
                    print(f"    {seq:3} {name[:34]:34} arr {ap_}  dep {dp_}{mark}")


if __name__ == "__main__":
    main()
