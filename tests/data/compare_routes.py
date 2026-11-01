"""What the route-direction fix (Nov 2026) changes on the SAME window: committed routes.json vs routes.py re-run.

  python tests/data/compare_routes.py --old data/routes.json --new /tmp/routes-same-window.json [--max-backward 0]

Before the fix a run counted for A -> B when its stop NUMBER at B was higher than at A; in a few runs per train the
source numbers stops against the direction of travel, so those runs counted for the wrong direction (241 list rows on 97
routes had their arrival more than 12 h after departure, hidden on the site by `runsThisWay`). They also fed the
route-level figures (runs, trips, shares, average, cancelled, train count). This prints how many routes change and by
how much, so the effect is on record, and fails if the new file still has a backward row (or more than --max-backward).
"""
import argparse
import json
import sys

FIELDS = ["runs", "trips", "late", "late6", "avg", "canc", "minutes", "trains", "rated", "unlisted"]


def backward(doc):
    return [(r["slug"], x[0], x[1], x[2], x[3]) for r in doc["routes"] for x in r["list"] if (x[3] - x[2]) % 1440 > 720]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--old", required=True)
    ap.add_argument("--new", required=True)
    ap.add_argument("--max-backward", type=int, default=0)
    args = ap.parse_args()
    old, new = json.load(open(args.old)), json.load(open(args.new))
    if old["window"] != new["window"]:
        sys.exit(f"windows differ: {old['window']} vs {new['window']}")
    bo, bn = backward(old), backward(new)
    print(f"window {old['window']['firstMonth']}..{old['window']['lastMonth']}")
    print(f"rows running the other way: {len(bo)} on {len({b[0] for b in bo})} routes before, {len(bn)} after")
    a = {r["slug"]: r for r in old["routes"]}
    b = {r["slug"]: r for r in new["routes"]}
    print(f"route pages: {len(a)} before, {len(b)} after; gone {sorted(set(a) - set(b))}, new {sorted(set(b) - set(a))}")
    changed = {f: [] for f in FIELDS}
    for s in sorted(set(a) & set(b)):
        for f in FIELDS:
            if a[s][f] != b[s][f]:
                changed[f].append((s, a[s][f], b[s][f]))
    touched = {s for v in changed.values() for s, _, _ in v}
    print(f"routes with any route-level figure changed: {len(touched)} of {len(set(a) & set(b))}")
    for f in FIELDS:
        v = changed[f]
        if not v:
            print(f"  {f:9} unchanged")
            continue
        big = max(v, key=lambda x: abs((x[2] or 0) - (x[1] or 0)))
        print(f"  {f:9} {len(v):4} routes, largest {big[0]} {big[1]} -> {big[2]}")
    rows_o = {(s, x[0], x[1]): x for s, r in a.items() for x in r["list"]}
    rows_n = {(s, x[0], x[1]): x for s, r in b.items() for x in r["list"]}
    gone = set(rows_o) - set(rows_n)
    print(f"train rows: {len(rows_o)} before, {len(rows_n)} after; {len(gone)} gone "
          f"({len(gone & {(x[0], x[1], x[2]) for x in bo})} of them were rows running the other way), {len(set(rows_n) - set(rows_o))} new")
    more = sum(1 for k in set(rows_o) & set(rows_n) if rows_n[k][5] > rows_o[k][5])
    print(f"train rows with more measured runs after (runs that had been counted the other way): {more}")
    if len(bn) > args.max_backward:
        print(f"FAIL: {len(bn)} rows still run the other way, e.g. {bn[:5]}")
        sys.exit(1)


if __name__ == "__main__":
    main()
