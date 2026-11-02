#!/usr/bin/env python3
"""Independent recount of data/abroad-history.json from the raw files (no DuckDB, no shared code: csv + dicts).

  python tests/data/verify_abroad_history.py --cache DIR [--json data/abroad-history.json] [--stats data/stats.json]

Re-reads every Rijden de Treinen services file of the window, keeps the Dutch stops of the trains the file lists,
recounts runs, measured arrivals, the 15+ share, the average, the departure figures at starting stops and the
cancelled share for EVERY (train, stop) cell, and prints each difference. Exit 1 on any difference, a missing or an
extra cell. Rounding: one decimal, as the file. The window and rules come from data/stats.json and the file's params,
re-read here, not imported.
"""
import argparse
import csv
import gzip
import json
import sys
from pathlib import Path

TYPES = {"ICE": "ICE", "EuroCity": "EC", "Intercity": "IC", "Eurocity Direct": "ECD", "Nightjet": "NJ"}


def r1(x):
    return None if x is None else round(x, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", required=True)
    ap.add_argument("--json", default="data/abroad-history.json")
    ap.add_argument("--stats", default="data/stats.json")
    a = ap.parse_args()
    doc = json.loads(Path(a.json).read_text())
    stats = json.loads(Path(a.stats).read_text())
    months = stats["window"]["months"]
    if doc["window"]["months"] != months:
        print(f"DIFF window {doc['window']['months']} vs stats {months}")
        sys.exit(1)
    lo, hi = stats["params"]["clampMinMinutes"], stats["params"]["clampMaxMinutes"]
    late, need = doc["params"]["lateMinutes"], doc["params"]["minStopRuns"]
    cache = Path(a.cache)
    station_files = sorted(cache.glob("rdt-stations-*.csv"))
    country = {}
    with open(station_files[-1], newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            country[r["code"]] = r["country"]
    trains = set(doc["trains"])
    # (train, station name) -> {run id: (stop id, row)}: the first row of a station within a run, by stop id.
    cells = {}
    for m in months:
        with gzip.open(cache / f"rdt-services-{m}.csv.gz", "rt", encoding="utf-8", newline="") as f:
            for r in csv.DictReader(f):
                t = TYPES.get(r["Service:Type"])
                if not t:
                    continue
                name = f"{t} {r['Service:Train number']}"
                if name not in trains or country.get(r["Stop:Station code"]) != "NL" or r["Service:Date"][:7] != m:
                    continue
                runs = cells.setdefault((name, r["Stop:Station name"]), {})
                sid = int(r["Stop:RDT-ID"])
                old = runs.get(r["Service:RDT-ID"])
                if old is None or sid < old[0]:
                    runs[r["Service:RDT-ID"]] = (sid, r)
    diffs = 0
    expected = {}
    for (train, st), runs in cells.items():
        rows = [x[1] for x in runs.values()]
        n = len(rows)

        def measured(kind):
            out = []
            for r in rows:
                if r[f"Stop:{kind} cancelled"] == "true" or not r[f"Stop:{kind} time"]:
                    continue
                try:
                    d = int(r[f"Stop:{kind} delay"])
                except ValueError:
                    continue
                if lo <= d <= hi:
                    out.append(d)
            return out

        arr, dep = measured("Arrival"), measured("Departure")
        canc = sum(1 for r in rows if r["Stop:Arrival cancelled"] == "true" or r["Stop:Departure cancelled"] == "true")
        has_arr = sum(1 for r in rows if r["Stop:Arrival time"])
        starts = has_arr * 2 < n
        a_ok, d_ok = len(arr) >= need, len(dep) >= need
        expected[(train, st)] = ["NL", n, len(arr),
                                 r1(100.0 * sum(d >= late for d in arr) / len(arr)) if a_ok else None,
                                 r1(sum(arr) / len(arr)) if a_ok else None,
                                 len(dep) if starts else 0,
                                 r1(100.0 * sum(d >= late for d in dep) / len(dep)) if starts and d_ok else None,
                                 r1(sum(dep) / len(dep)) if starts and d_ok else None,
                                 r1(100.0 * canc / n)]
    got = {(t, s): v for t, sts in doc["trains"].items() for s, v in sts.items() if v[0] == "NL"}
    for k in sorted(set(expected) | set(got)):
        e, g = expected.get(k), got.get(k)
        if e is None or g is None:
            print(f"DIFF {k}: {'missing in file' if g is None else 'not in the raw data'}")
            diffs += 1
            continue
        if e != g:
            print(f"DIFF {k}: file {g} recount {e}")
            diffs += 1
    print(f"verify abroad history: {len(expected)} cells recounted (NL, {len(months)} months), {diffs} differences")
    sys.exit(1 if diffs else 0)


if __name__ == "__main__":
    main()
