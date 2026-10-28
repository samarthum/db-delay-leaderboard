#!/usr/bin/env python3
"""Compare data/monthly.json and data/stats.json with the reference numbers from the research phase.

The reference was computed by year.py without the clamp and without the window-month restriction,
so small differences are expected. --strict exits 1 when a monthly average is off by more than
0.5 min or the reference top 3 is not our top 3.
"""
import argparse
import json
import sys
from pathlib import Path

# From /workspace/db-delays/year_out.txt (research workspace, outside this repo):
# month, runs, avg final delay, median, full-cancel %.
REF_MONTHLY = [
    ("2025-11", 29890, 16.8, 8.0, 2.2),
    ("2025-12", 32449, 13.1, 5.0, 2.3),
    ("2026-01", 33396, 20.6, 10.0, 8.6),
    ("2026-02", 29100, 14.3, 6.0, 4.5),
    ("2026-03", 31408, 12.8, 5.0, 3.2),
    ("2026-04", 30873, 11.9, 4.0, 1.8),
    ("2026-05", 32161, 14.3, 6.0, 2.2),
    ("2026-06", 31108, 20.9, 9.0, 4.9),
    ("2026-07", 32781, 18.8, 8.0, 4.0),
    ("2026-08", 33380, 17.9, 8.0, 3.8),
    ("2026-09", 31481, 17.7, 9.0, 2.6),
]

# From /workspace/db-delays/top10_sample.json: train, avg, sd, median, p90, measured.
REF_TOP10 = [
    ("NJ 40490", 64.1, 56.4, 50.0, 152.0, 328),
    ("NJ 420", 62.2, 54.9, 48.5, 144.0, 330),
    ("NJ 493", 48.5, 58.4, 32.0, 115.0, 110),
    ("ICE 1541", 46.2, 42.3, 36.0, 108.0, 249),
    ("FLX 1239", 42.9, 49.7, 27.5, 110.0, 264),
    ("FLX 1237", 41.6, 48.2, 27.5, 101.0, 112),
    ("ICE 554", 40.5, 30.2, 38.0, 77.0, 134),
    ("IC 2013", 40.5, 33.1, 35.0, 80.0, 237),
    ("NJ 40421", 39.0, 55.8, 20.0, 106.0, 323),
    ("ICE 657", 38.8, 33.6, 33.0, 78.0, 117),
]

MAX_MONTHLY_AVG_DIFF = 0.5
SENSITIVITY_SHIFT = 1.0


def fmt(x, width=7, digits=1):
    return f"{'-':>{width}}" if x is None else f"{x:>{width}.{digits}f}"


def diff(ours, ref, width=7):
    return fmt(None if ours is None else ours - ref, width)


def sensitivity(base, alt, alt_dir):
    """Top 10 of each ranking in `base` vs a second run `alt` computed with other settings."""
    changed = {k: (base["params"][k], alt["params"].get(k)) for k in base["params"]
               if base["params"][k] != alt["params"].get(k)}
    print(f"\nSENSITIVITY: this run vs {alt_dir}"
          + (f" (params changed: {', '.join(f'{k} {a} -> {b}' for k, (a, b) in changed.items())})" if changed
             else " (no params differ; e.g. a --pct-cap run, which is not recorded in the JSON)"))
    for mode, unit in (("minutes", "min"), ("percent", "%")):
        top_n = base["params"]["topN"]
        ours = {t["train"]: (i, t[mode]["avg"]) for i, t in enumerate(base["rankings"][mode], 1)}
        theirs = {t["train"]: (i, t[mode]["avg"]) for i, t in enumerate(alt["rankings"][mode], 1)}
        trains = [t["train"] for t in base["rankings"][mode][:top_n]]
        trains += [t["train"] for t in alt["rankings"][mode][:top_n] if t["train"] not in trains]
        print(f"\n{mode} top {top_n} ({unit}): {'train':9} {'rank':>4} {'avg':>6} | {'alt rank':>8} {'alt avg':>7} {'Δ':>6}  flags")
        for train in trains:
            r1, a1 = ours.get(train, (None, None))
            r2, a2 = theirs.get(train, (None, None))
            flags = []
            if a1 is not None and a2 is not None and abs(a2 - a1) > SENSITIVITY_SHIFT:
                flags.append(f"shift > {SENSITIVITY_SHIFT:g} {unit}")
            in1, in2 = r1 is not None and r1 <= top_n, r2 is not None and r2 <= top_n
            if in1 and not in2:
                flags.append("leaves top 10")
            if in2 and not in1:
                flags.append("enters top 10")
            print(f"{'':20}{train:9} {r1 or '-':>4} {fmt(a1, 6)} | {r2 or '-':>8} {fmt(a2, 7)} "
                  f"{diff(a2, a1, 6) if a1 is not None else fmt(None, 6)}  {', '.join(flags)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data-dir", default=str(Path(__file__).resolve().parent.parent / "data"))
    ap.add_argument("--sensitivity", metavar="DIR", action="append", default=[],
                    help="also compare the rankings with a second compute.py run written to DIR, e.g. "
                         "compute.py --clamp-min -1000 --out-dir /tmp/no-floor (repeatable)")
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()
    data = Path(args.data_dir)
    monthly = {m["month"]: m for m in json.loads((data / "monthly.json").read_text())["months"]}
    stats = json.loads((data / "stats.json").read_text())
    ranking = stats["rankings"]["minutes"]
    problems = []

    print("Monthly: reference (year.py, unclamped) vs ours (clamped; unclamped avg in 'raw')")
    print(f"{'month':7} {'runs':>6} {'ours':>6} {'Δ':>4} | {'avg':>5} {'ours':>5} {'Δ':>5} {'raw':>5} {'Δraw':>5} "
          f"{'drop':>4} | {'med':>5} {'ours':>5} {'Δ':>5} | {'canc%':>5} {'ours':>5} {'Δ':>5}")
    for month, runs, avg, med, canc in REF_MONTHLY:
        m = monthly.get(month)
        if m is None:
            print(f"{month:7} not in our window")
            continue
        print(f"{month:7} {runs:6d} {m['runs']:6d} {m['runs'] - runs:4d} | {avg:5.1f} {m['avgDelayMin']:5.1f} "
              f"{diff(m['avgDelayMin'], avg, 5)} {m['avgDelayMinUnclamped']:5.1f} {diff(m['avgDelayMinUnclamped'], avg, 5)} "
              f"{m['droppedByClamp']:4d} | {med:5.1f} {m['medianDelayMin']:5.1f} {diff(m['medianDelayMin'], med, 5)} | "
              f"{canc:5.1f} {m['fullCancelPct']:5.1f} {diff(m['fullCancelPct'], canc, 5)}")
        if abs(m["avgDelayMin"] - avg) > MAX_MONTHLY_AVG_DIFF:
            problems.append(f"{month}: avg {m['avgDelayMin']} vs reference {avg}")

    ours_by_train = {t["train"]: t for t in ranking}
    print("\nMinutes top 10: reference (year.py) vs ours")
    print(f"{'#':>2} {'train':9} | {'avg':>5} {'ours':>5} {'Δ':>5} | {'sd':>5} {'ours':>5} | {'med':>5} {'ours':>5} | "
          f"{'p90':>5} {'ours':>5} | {'meas':>4} {'ours':>4} | our rank")
    for i, (train, avg, sd, med, p90, measured) in enumerate(REF_TOP10, 1):
        t = ours_by_train.get(train)
        if t is None:
            print(f"{i:2d} {train:9} | {avg:5.1f} not in our top {len(ranking)}")
            continue
        d = t["minutes"]
        print(f"{i:2d} {train:9} | {avg:5.1f} {d['avg']:5.1f} {diff(d['avg'], avg, 5)} | {sd:5.1f} {d['sd']:5.1f} | "
              f"{med:5.1f} {d['median']:5.1f} | {p90:5.1f} {d['p90']:5.1f} | {measured:4d} {t['measured']:4d} | "
              f"{t['rank']['minutes']}")
    newcomers = [f"{t['rank']['minutes']}. {t['train']} ({t['minutes']['avg']})" for t in ranking[:10]
                 if t["train"] not in {r[0] for r in REF_TOP10}]
    if newcomers:
        print("In our top 10 but not the reference's:", ", ".join(newcomers))

    ref_top3 = [r[0] for r in REF_TOP10[:3]]
    our_top3 = [t["train"] for t in ranking[:3]]
    if ref_top3 != our_top3:
        problems.append(f"top 3 {our_top3} vs reference {ref_top3}")

    for alt_dir in args.sensitivity:
        sensitivity(stats, json.loads((Path(alt_dir) / "stats.json").read_text()), alt_dir)

    print("\n" + ("Differences beyond tolerance:\n  " + "\n  ".join(problems) if problems else "Within tolerance."))
    sys.exit(1 if args.strict and problems else 0)


if __name__ == "__main__":
    main()
