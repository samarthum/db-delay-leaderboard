"""Synthetic monthly Parquet files in the shape of piebro's monthly_processed_data/data-YYYY-MM.parquet, for testing the
monthly refresh (scripts/monthly.py) and its verifier (tests/data/verify_monthly.py) without Hugging Face.

  python tests/data/monthly_fixture.py OUT_DIR 2026-06 2026-07 2026-08 2026-09 [2026-10]

Columns are the ones the pipeline reads (one row per stop of a ride): id ("<trip>-<yyMMddHHmm start>-<stop no>"),
train_type, train_number, line_number, train_line_station_num, eva, station_name, final_destination_station,
arrival/departure_planned_time, arrival/departure_change_time (the planned time when nothing changed),
arrival/departure_is_canceled, is_replacement_train. Times are naive Berlin wall clock, as in the source.

What it holds, so every scope rule of the pipeline is exercised:
- Three long-distance corridors, both ways, daily: Düsseldorf - Köln - Frankfurt - Stuttgart - Ulm - München (ICE
  500-599), Hamburg - Hannover - Berlin (ICE 700-799, some IC) and Hannover - Köln (ICE 900-959, where trains part ways). Enough runs for route pages (4,000
  measured trips per pair over 4 months), train pages (100 runs) and change-train pairs (2,000 runs per station).
- ICE 517 (Düsseldorf -> München) has its stop numbers REVERSED every Wednesday: the source's numbering runs against the
  direction of travel. A stop-number rule puts it on München -> Düsseldorf routes ("15:15 -> 11:20"); a planned-time
  rule does not. This is the Nov 2026 route-direction bug.
- Stop rows numbered 100 and up, appended after the planned list as in the source (Nov 2026 last-stop fix): ICE 703
  (Hamburg -> Berlin) is diverted on Mondays via Uelzen (stop 100) and Stendal Hbf (stop 101), both planned BEFORE Berlin
  Hbf (stop 3); ICE 702 (Berlin -> Hamburg) lists Hannover Hbf twice on Tuesdays (stop 2 and stop 100, same planned
  times, the copy 7 minutes later); ICE 705 lists its last stop Berlin Hbf twice on Thursdays (stop 3 and stop 100, same
  planned times, the copy 20 minutes later and under Berlin Hbf's other station id). "Last stop by stop number" measures
  these runs at Stendal, Hannover and the copy; the rule (planned time, then stop number; a station listed twice at the same planned times is one stop, the
  lowest number) measures them at Berlin, Hamburg and Berlin's stop 3.
- Cancelled stops, whole cancelled runs, delays outside -10..600 (not measured), a replacement train (excluded), a train
  ending abroad (Amsterdam Centraal label), runs starting late on the last day of a month (belong to that month).
- ~110 regional lines (RE 1-110) over 1,100 stations so every month has >= 1,000 stations (compute.py's full-month rule);
  RE 1-3 run often enough for a line page; RE 4's first run each day turns into RE 50 with another number half way
  (a ride's line and number must be picked the same way every time).
"""
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

CORRIDOR_A = ["Düsseldorf Hbf", "Köln Hbf", "Frankfurt (Main) Hbf", "Stuttgart Hbf", "Ulm Hbf", "München Hbf"]
HOPS_A = [24, 70, 80, 60, 75]  # planned minutes between consecutive stops
CORRIDOR_B = ["Hamburg Hbf", "Hannover Hbf", "Berlin Hauptbahnhof"]
HOPS_B = [80, 100]
CORRIDOR_C = ["Hannover Hbf", "Köln Hbf"]  # crosses B at Hannover and A at Köln: trains that part ways (change trains)
HOPS_C = [160]
BERLIN_TIEF = 8098160  # ICE 705's copy of Berlin Hbf carries the other station id (tief / oben), same name
DETOUR = ["Uelzen", "Stendal Hbf"]  # ICE 703's Monday diversion stops (rows numbered 100, 101)
EVA = {name: 8000100 + i for i, name in enumerate(dict.fromkeys(CORRIDOR_A + CORRIDOR_B + CORRIDOR_C + DETOUR))}
REGIONAL_STATIONS = [f"Halt {i:04d}" for i in range(1100)]
for i, name in enumerate(REGIONAL_STATIONS):
    EVA[name] = 8100000 + i
COLUMNS = ["id", "train_type", "train_number", "line_number", "train_line_station_num", "eva", "station_name",
           "final_destination_station", "arrival_planned_time", "arrival_change_time", "arrival_is_canceled",
           "departure_planned_time", "departure_change_time", "departure_is_canceled", "is_replacement_train"]


def delay(rng):
    x = rng.random()
    if x < 0.55:
        return rng.randint(0, 4)
    if x < 0.8:
        return rng.randint(5, 14)
    if x < 0.95:
        return rng.randint(15, 59)
    if x < 0.995:
        return rng.randint(60, 180)
    return rng.choice([-15, 700])  # outside the clamp: not measured


def ride(rows, rng, trip, tt, num, line, names, hops, start, dest=None, reverse_seq=False, replacement=False,
         cancel_all=False, cancel_at=None, line2=None, num2=None, extra=(), dup=None):
    """Append the stop rows of one ride starting at `start` (datetime).

    extra: [(station, minutes after start, stop number)] rows appended after the planned list (a diversion), 3 min late.
    dup: (index, stop number, minutes later, station id or None) lists the stop at `index` again under another stop number,
    same planned times (and name; ICE 705's copy has Berlin Hbf's other station id).
    """
    times, t = [], start
    for i in range(len(names)):
        times.append(t)
        if i < len(hops):
            t = t + timedelta(minutes=hops[i])
    stamp = start.strftime("%y%m%d%H%M")
    late = 0
    n = len(names)
    first = len(rows)
    for i, (name, t) in enumerate(zip(names, times)):
        seq = (n - i) if reverse_seq else (i + 1)
        late = max(late + rng.randint(-2, 3), 0) if i else 0
        if i == n - 1:
            late = delay(rng)
        canc = cancel_all or (cancel_at == i)
        arr = t if i > 0 else None
        dep = t + timedelta(minutes=2) if i < n - 1 else None
        rows.append({
            "id": f"{trip}-{stamp}-{seq}", "train_type": tt,
            "train_number": num2 if num2 and i >= n // 2 else num, "line_number": line2 if line2 and i >= n // 2 else line,
            "train_line_station_num": seq, "eva": str(EVA[name]), "station_name": name,
            "final_destination_station": dest or names[-1],
            "arrival_planned_time": arr, "arrival_change_time": arr + timedelta(minutes=late) if arr else None,
            "arrival_is_canceled": canc and arr is not None,
            "departure_planned_time": dep, "departure_change_time": dep + timedelta(minutes=max(late - 1, 0)) if dep else None,
            "departure_is_canceled": canc and dep is not None,
            "is_replacement_train": replacement,
        })
    for name, minutes, seq in extra:
        t = start + timedelta(minutes=minutes)
        rows.append({**rows[first], "id": f"{trip}-{stamp}-{seq}", "train_line_station_num": seq, "eva": str(EVA[name]),
                     "station_name": name, "arrival_planned_time": t, "arrival_change_time": t + timedelta(minutes=3),
                     "arrival_is_canceled": cancel_all, "departure_planned_time": t + timedelta(minutes=2),
                     "departure_change_time": t + timedelta(minutes=5), "departure_is_canceled": cancel_all})
    if dup is not None:
        i, seq, later, eva = dup
        r = rows[first + i]
        shift = lambda x: x + timedelta(minutes=later) if x else None
        rows.append({**r, "id": f"{trip}-{stamp}-{seq}", "train_line_station_num": seq, "eva": str(eva or r["eva"]),
                     "arrival_change_time": shift(r["arrival_change_time"]), "departure_change_time": shift(r["departure_change_time"])})


def month_rows(month, rng):
    y, m = map(int, month.split("-"))
    first = datetime(y, m, 1)
    last = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    rows, trip = [], 7_000_000_000_000_000_000 + y * 100_000_000 + m * 1_000_000
    day = first
    while day < last:
        # Corridor A, both ways: 50 trains each way, one an hour from 04:10 (some start late on the last day).
        for k in range(50):
            dep = day + timedelta(hours=4 + (k * 20) // 60, minutes=(10 + k * 20) % 60)
            for south in (True, False):
                num = str(501 + 2 * k) if south else str(500 + 2 * k)
                names = CORRIDOR_A if south else CORRIDOR_A[::-1]
                hops = HOPS_A if south else HOPS_A[::-1]
                trip += 1
                reverse = num == "517" and day.weekday() == 2
                ride(rows, rng, trip, "ICE", num, None, names, hops, dep,
                     dest="Amsterdam Centraal" if num == "500" else None, reverse_seq=reverse,
                     cancel_all=rng.random() < 0.02, cancel_at=(len(names) - 1) if rng.random() < 0.02 else None)
        # Corridor B, both ways.
        for k in range(50):
            dep = day + timedelta(hours=5 + (k * 18) // 60, minutes=(5 + k * 18) % 60)
            for east in (True, False):
                tt = "IC" if k % 5 == 0 else "ICE"
                num = str(701 + 2 * k) if east else str(700 + 2 * k)
                trip += 1
                wd = day.weekday()
                extra = [("Uelzen", 40, 100), ("Stendal Hbf", 140, 101)] if num == "703" and wd == 0 else ()
                dup = (1, 100, 7, None) if num == "702" and wd == 1 else (2, 100, 20, BERLIN_TIEF) if num == "705" and wd == 3 else None
                ride(rows, rng, trip, tt, num, None, CORRIDOR_B if east else CORRIDOR_B[::-1],
                     HOPS_B if east else HOPS_B[::-1], dep, cancel_all=rng.random() < 0.02, extra=extra, dup=dup)
        # Corridor C, both ways, 30 trains each way (ICE 900-959).
        for k in range(30):
            dep = day + timedelta(hours=6, minutes=7 + k * 29)
            for west in (True, False):
                trip += 1
                ride(rows, rng, trip, "ICE", str(901 + 2 * k) if west else str(900 + 2 * k), None,
                     CORRIDOR_C if west else CORRIDOR_C[::-1], HOPS_C, dep, cancel_all=rng.random() < 0.03)
        # A replacement train (never counted) on the corridor.
        trip += 1
        ride(rows, rng, trip, "ICE", "99999", None, CORRIDOR_B, HOPS_B, day + timedelta(hours=12), replacement=True)
        # Regional lines: 110 lines of 10 stations; RE 1-3 every hour, the rest twice a day (one train number per run).
        for ln in range(110):
            stations = REGIONAL_STATIONS[ln * 10:(ln + 1) * 10]
            per_day = 12 if ln < 3 else 2
            for k in range(per_day):
                trip += 1
                start = day + timedelta(hours=6 + k, minutes=ln % 60)
                # RE 4's first run of the day becomes RE 50 (another number) half way: line and number change en route.
                change = ln == 3 and k == 0
                ride(rows, rng, trip, "RE", str(10000 + ln * 100 + k), f"RE{ln + 1}", stations if k % 2 == 0 else stations[::-1],
                     [6] * 9, start, line2="RE50" if change else None, num2="99999" if change else None)
        day += timedelta(days=1)
    return rows


def write_month(out_dir, month):
    rng = random.Random(f"gp-fixture-{month}")
    rows = month_rows(month, rng)
    cols = {c: [r[c] for r in rows] for c in COLUMNS}
    ts = pa.timestamp("us")
    schema = pa.schema([("id", pa.string()), ("train_type", pa.string()), ("train_number", pa.string()),
                        ("line_number", pa.string()), ("train_line_station_num", pa.int64()), ("eva", pa.string()),
                        ("station_name", pa.string()), ("final_destination_station", pa.string()),
                        ("arrival_planned_time", ts), ("arrival_change_time", ts), ("arrival_is_canceled", pa.bool_()),
                        ("departure_planned_time", ts), ("departure_change_time", ts), ("departure_is_canceled", pa.bool_()),
                        ("is_replacement_train", pa.bool_())])
    path = Path(out_dir) / f"data-{month}.parquet"
    pq.write_table(pa.table(cols, schema=schema), path)
    return path, len(rows)


def write_stations_csv(out_dir):
    """A Trainline-shaped stations.csv (db_id;latitude;longitude;is_main_station;id) for compute.py --stations-csv."""
    path = Path(out_dir) / "stations.csv"
    lines = ["id;name;db_id;latitude;longitude;is_main_station"]
    for i, (name, eva) in enumerate(sorted(EVA.items(), key=lambda kv: kv[1])):
        lines.append(f"{i + 1};{name};{eva};{50 + (i % 100) / 50:.4f};{8 + (i // 100) / 10:.4f};t")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return path


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    write_stations_csv(out)
    for month in sys.argv[2:]:
        path, n = write_month(out, month)
        print(f"{path}: {n} rows")


if __name__ == "__main__":
    main()
