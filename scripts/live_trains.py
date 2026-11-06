"""Timetable for live lookups of single trains: for every long-distance train number in the last two months of data,
the usual first station (EVA), planned departure there, last station, planned arrival there, and the weekdays it ran.

  ~/gp-search/venv-dir/v/bin/python scripts/live_trains.py --data-dir ~/gp-search/parquet

Writes data/live-trains.json: { "ICE 1541": [oEva, oName, "HH:MM", dEva, dName, "HH:MM", weekdayBits, minutes, [more variants]] }.
api/live.js reads it to find today's run of a train in DB's Timetables API (plan of the origin station for that hour).
A train number keeps every variant (origin, destination, departure time, weekdays) seen on MIN_RUNS+ runs; see build().
"""
import argparse, glob, json, os
from collections import Counter

import duckdb

LONG = ("ICE", "IC", "EC", "ECE", "RJ", "RJX", "TGV", "FLX")
MIN_RUNS = 3  # runs in the last two months for a variant to count
MERGE_MIN = 10  # departure times this close (same stations) are one variant


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out", default="data/live-trains.json")
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.data_dir, "data-*.parquet")))[-2:]
    con = duckdb.connect()
    con.execute("set memory_limit='1200MB'; set preserve_insertion_order=false")
    # Only stations whose DB Timetables id is verified (data/live-stations.json, the route-page stations): some raw ids
    # point at an S-Bahn or bus level that the API answers without long-distance trains (Hamburg Dammtor, Lindau-Reutin).
    live = json.load(open("data/live-stations.json"))
    # Ids the Timetables API answers without long-distance trains (checked 31 Oct 2026 over three hours each).
    for name in ("Düsseldorf Flughafen", "Köln Messe/Deutz", "Stendal Hbf", "Wolfsburg Hbf"):
        live.pop(name, None)
    con.execute("create table ls(eva varchar, site varchar)")
    con.executemany("insert into ls values (?, ?)", [(v["eva"], k) for k, v in live.items()])
    src = ", ".join(f"'{f}'" for f in files)
    types = ", ".join(f"'{t}'" for t in LONG)
    # Same as short() in routes.py / shortStation() on the site, so raw names meet the verified station list.
    SHORT = ("regexp_replace(regexp_replace(regexp_replace(replace(replace(p.station_name, 'Hauptbahnhof', 'Hbf'), "
             "'Frankfurt am Main Flughafen Fernbahnhof', 'Frankfurt Flughafen'), '^Frankfurt \\(Main\\) ', 'Frankfurt '), "
             "' \\((Westf|Breisgau|Saale|Oder)\\)', '', 'g'), '^Frankfurt Flughafen Fernbahnhof$', 'Frankfurt Flughafen')")
    rows = con.execute(rf"""
    with s as (
      select train_type tt, train_number num, regexp_extract(id, '^(.*-\d{{10}})-\d+$', 1) run,
             -- stop order: planned time, then stop number (rows numbered 100+ sit mid-route), as in compute.py
             epoch(coalesce(arrival_planned_time, departure_planned_time))::bigint * 100000 + train_line_station_num seq,
             ls.eva, ls.site name, departure_planned_time dp, arrival_planned_time ap
      from read_parquet([{src}]) p join ls on ls.site = {SHORT}
      where train_type in ({types}) and not is_replacement_train),
    r as (
      select tt, num, run,
        arg_min(eva, seq) filter (where dp is not null) oe, arg_min(name, seq) filter (where dp is not null) onm,
        min(dp) filter (where dp is not null) odp,
        arg_max(eva, seq) filter (where ap is not null) de, arg_max(name, seq) filter (where ap is not null) dnm,
        max(ap) dap
      from s group by 1, 2, 3)
    select tt, num, oe, onm, strftime(odp, '%H:%M') dep, de, dnm, strftime(dap, '%H:%M') arr,
           isodow(odp) wd, date_diff('minute', odp, dap) mins
    from r where dap > odp and oe is not null and de is not null
    """).fetchall()
    out = build(rows)
    # Trains from abroad: data/abroad-trips.json measured its gap against the main variant's time, so that variant stays
    # first (abroad_trips.mjs reads item 2 of the main variant).
    old = json.load(open(a.out)) if os.path.exists(a.out) else {}
    abroad = json.load(open("data/abroad-trips.json"))
    for k in abroad:
        if k in out and k in old:
            vs = [out[k][:8]] + (out[k][8] if len(out[k]) > 8 else [])
            i = next((i for i, v in enumerate(vs) if v[0] == old[k][0] and v[2] == old[k][2]), None)
            if i:
                vs.insert(0, vs.pop(i))
                out[k] = vs[0] + ([vs[1:]] if len(vs) > 1 else [])
    with open(a.out, "w") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write("\n")
    extra = sum(len(v[8]) for v in out.values() if len(v) > 8)
    print(f"live trains: {len(out)} numbers, {extra} extra variants -> {a.out} ({os.path.getsize(a.out) / 1e3:.0f} kB)")


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def build(rows):
    """rows: (type, number, oEva, oName, dep, dEva, dName, arr, isodow, minutes), one per run.

    Per train number every variant seen on at least MIN_RUNS runs, most common first: a number often runs different
    routes on different weekdays or in different weeks (ICE 624 ends in Düsseldorf, Köln or Essen), so keeping one
    pattern left every other day without live times. Departure times of one origin+destination within MERGE_MIN
    minutes are one variant (timetable versions shift times by a few minutes); its time is the most common one.
    Value: the main variant [oEva, oName, dep, dEva, dName, arr, weekdayBits, minutes] plus, as item 8, a list of
    the other variants in the same shape (item 8 absent when there are none).
    """
    by = {}
    for tt, num, oe, onm, dep, de, dnm, arr, wd, mins in rows:
        by.setdefault((tt, num, oe, de), []).append((dep, onm, dnm, arr, wd, mins))
    per = {}
    for (tt, num, oe, de), runs in by.items():
        counts = Counter(r[0] for r in runs)
        anchors = []
        for dep, _ in counts.most_common():
            if all(abs(minutes(dep) - minutes(x)) > MERGE_MIN for x in anchors):
                anchors.append(dep)
        for anchor in anchors:
            grp = [r for r in runs if abs(minutes(r[0]) - minutes(anchor)) <= MERGE_MIN
                   and min(anchors, key=lambda x: abs(minutes(r[0]) - minutes(x))) == anchor]
            if len(grp) < MIN_RUNS:
                continue
            bits = 0
            for r in grp:
                bits |= 1 << (r[4] - 1)
            arr = Counter(r[3] for r in grp).most_common(1)[0][0]
            mins = int(sorted(r[5] for r in grp)[len(grp) // 2])
            per.setdefault(f"{tt} {num}", []).append((len(grp), [oe, grp[0][1], anchor, de, grp[0][2], arr, bits, mins]))
    out = {}
    for k, vs in per.items():
        vs.sort(key=lambda x: -x[0])
        main = vs[0][1]
        out[k] = main + ([[v[1] for v in vs[1:]]] if len(vs) > 1 else [])
    return out


if __name__ == "__main__":
    main()
