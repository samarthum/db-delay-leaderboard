#!/usr/bin/env python3
"""TEST ONLY. A small raw_data tree in the shape of piebro/deutsche-bahn-data's raw files, for scripts/last7.py.

It simulates piebro's fetch job (scripts/fetch_eva_plan_and_change.py there): runs at 03:17, 09:17, 15:17 and 21:17
UTC; each run fetches the plan for the Berlin hours from 9 hours back to 2 hours ahead that are not covered yet, plus
one full change list (fchg) per station; a change list keeps an event for 6.5 hours after it happened. Files go to
raw_data/year=Y/month=M/day=D/date_<plan date>_hour_HH_HH.parquet by UTC fetch day, columns as piebro's README.

The window is 24-30 Oct 2026 (it crosses the end of summer time on 25 Oct). Scenarios, and what scripts/last7.py must
make of them, are in EXPECTED (built from the timetable below, not from the script's code):
  ICE 100  Köln -> Frankfurt -> München, daily; one day 22 min late; a diversion stop (ps="a") on day 6
  IC 200   Hamburg -> Berlin; day 2 fully cancelled, day 4 last stop cancelled, day 5 first stop cancelled
  ICE 300  Köln -> Berlin, only days 0-4
  ICE 400  Berlin 23:30 -> München 04:10 next day: belongs to its start day
  ICE 600  Frankfurt -> Hamburg; day 1 700 min late at the end (not measured), day 5 last stop cancelled, then
           reinstated (cs="p"): not cancelled
  RE 5     regional: left out; ICE 9500 replacement train (t="e", ref ICE 100): left out
  A missed fetch run (27 Oct 15:17 UTC): the change list jumps 12 hours, runs in that stretch are "?"
  A plan hour that never arrives (29 Oct 03:00 Berlin): ICE 400 of 28 Oct is "?"

  python tests/data/last7_fixture.py OUT_DIR      # writes OUT_DIR/raw_data/... and OUT_DIR/names.json
"""
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pyarrow as pa
import pyarrow.parquet as pq

BERLIN = ZoneInfo("Europe/Berlin")
DAY0 = date(2026, 10, 24)
DAYS = [DAY0 + timedelta(days=i) for i in range(7)]
RETENTION = timedelta(hours=6.5)
LOOKAHEAD = timedelta(hours=3)  # fchg lists forecasts for events up to this far ahead
API = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1"

STATIONS = {"08000001": "Köln Hbf", "08000002": "Frankfurt (Main) Hbf", "08000003": "München Hbf",
            "08000004": "Hamburg Hbf", "08000005": "Berlin Hauptbahnhof", "08000006": "Kleinstadt"}
# One station is missing from the name file: its XML name is used ("Berlin Hbf" in the XML would be wrong here, so
# the XML carries the full name too).
NAMES = {k: v for k, v in STATIONS.items() if k != "08000004"}
EVA = {v: k for k, v in STATIONS.items()}

# train: (type, number, trip id, [(station, arr offset, dep offset) minutes after start], start "HH:MM", days)
TRAINS = [
    ("ICE", "100", "-7101", [("Köln Hbf", None, 0), ("Frankfurt (Main) Hbf", 63, 65), ("München Hbf", 270, None)], "08:00", range(7)),
    ("IC", "200", "7202", [("Hamburg Hbf", None, 0), ("Berlin Hauptbahnhof", 115, None)], "10:00", range(7)),
    ("ICE", "300", "-7303", [("Köln Hbf", None, 0), ("Frankfurt (Main) Hbf", 60, 62), ("Berlin Hauptbahnhof", 260, None)], "14:00", range(5)),
    ("ICE", "400", "7404", [("Berlin Hauptbahnhof", None, 0), ("Frankfurt (Main) Hbf", 200, 202), ("München Hbf", 280, None)], "23:30", range(7)),
    ("ICE", "600", "-7606", [("Frankfurt (Main) Hbf", None, 0), ("Köln Hbf", 65, 67), ("Hamburg Hbf", 240, None)], "16:00", range(7)),
    ("RE", "5", "7505", [("Kleinstadt", None, 0), ("Köln Hbf", 40, None)], "07:00", range(7)),
]
# Delay per (train, day, stop index): (arrival delay, departure delay); default 0. Cancellations separately.
DELAYS = {
    ("ICE 100", 0): [(None, 2), (5, 6), (8, None)],
    ("ICE 100", 1): [(None, 0), (0, 0), (0, None)],
    ("ICE 100", 2): [(None, 4), (12, 14), (22, None)],
    ("ICE 100", 3): [(None, 1), (3, 3), (9, None)],
    ("ICE 100", 4): [(None, 0), (2, 2), (-3, None)],
    ("ICE 100", 5): [(None, 7), (15, 16), (31, None)],
    ("ICE 100", 6): [(None, 0), (1, 1), (4, None)],
    ("IC 200", 0): [(None, 3), (17, None)],
    ("IC 200", 1): [(None, 0), (6, None)],
    ("IC 200", 3): [(None, 1), (2, None)],
    ("IC 200", 4): [(None, 9), (0, None)],
    ("IC 200", 5): [(None, 0), (11, None)],
    ("IC 200", 6): [(None, 2), (15, None)],
    ("ICE 300", 0): [(None, 0), (1, 1), (2, None)],
    ("ICE 300", 1): [(None, 5), (7, 8), (19, None)],
    ("ICE 300", 2): [(None, 0), (0, 0), (0, None)],
    ("ICE 300", 3): [(None, 6), (25, 26), (44, None)],
    ("ICE 300", 4): [(None, 2), (3, 3), (5, None)],
    ("ICE 400", 0): [(None, 0), (4, 4), (6, None)],
    ("ICE 400", 1): [(None, 12), (20, 20), (18, None)],
    ("ICE 400", 2): [(None, 0), (0, 0), (2, None)],
    ("ICE 400", 3): [(None, 3), (3, 3), (3, None)],
    ("ICE 400", 5): [(None, 1), (1, 1), (61, None)],
    ("ICE 400", 6): [(None, 0), (0, 0), (0, None)],
    ("ICE 600", 0): [(None, 3), (8, 9), (16, None)],
    ("ICE 600", 1): [(None, 0), (300, 300), (700, None)],
    ("ICE 600", 2): [(None, 1), (1, 1), (1, None)],
    ("ICE 600", 3): [(None, 0), (4, 4), (7, None)],
    ("ICE 600", 5): [(None, 2), (2, 2), (12, None)],
    ("ICE 600", 6): [(None, 0), (0, 0), (0, None)],
}
# (train, day) -> stop indices cancelled ("all" = every stop); "reinstated": cancelled then back (cs="p").
CANCELLED = {("IC 200", 2): "all", ("IC 200", 4): [1], ("IC 200", 5): [0]}
REINSTATED = {("ICE 600", 5): [2]}
DIVERSION = {("ICE 100", 6): ("Hamburg Hbf", 150)}  # extra stop, minutes after start, seq between 1 and 2
MISSED_RUN = datetime(2026, 10, 27, 15, 17)  # UTC
LOST_PLAN_HOUR = datetime(2026, 10, 29, 3)  # Berlin

# What scripts/last7.py must output for each train: per day [dep, arr], "x" fully cancelled, "?" incomplete data,
# None no run. Worked out by hand from the timetable above and the rules in docs/notes/data-pipeline.md:
# - The missed 15:17 UTC run on 27 Oct (day 3) leaves 12 h between change lists (10:17 and 22:17 Berlin, CET). Events
#   between 10:17 and 15:47 are lost (they would read as "no delay"), so every run touching 10:00-22:00 Berlin that
#   day is "?": ICE 100 (08:00-12:30), IC 200, ICE 300 (14:00-18:20), ICE 600 (16:00-20:00, its events happen to be
#   kept, the rule is conservative). ICE 400 of 26 and 27 Oct (23:30 to 04:10) is outside it: measured.
# - The plan hour 29 Oct 03:00 never arrives: ICE 400 of 28 Oct (day 4, 23:30 to 04:10) is "?"; of 29 Oct it is not.
# - ICE 600 day 1: 700 min at Hamburg is outside -10..600, so the arrival is not measured (None).
EXPECTED = {
    "ICE 100": [[2, 8], [0, 0], [4, 22], "?", [0, -3], [7, 31], [0, 4]],
    "IC 200": [[3, 17], [0, 6], "x", "?", [9, "x"], ["x", 11], [2, 15]],
    "ICE 300": [[0, 2], [5, 19], [0, 0], "?", [2, 5], None, None],
    "ICE 400": [[0, 6], [12, 18], [0, 2], [3, 3], "?", [1, 61], [0, 0]],
    "ICE 600": [[3, 16], [0, None], [1, 1], "?", [0, 0], [2, 12], [0, 0]],
}
EXPECTED_ENDS = {"ICE 100": ("Köln Hbf", "München Hbf"), "IC 200": ("Hamburg Hbf", "Berlin Hauptbahnhof"),
                 "ICE 300": ("Köln Hbf", "Berlin Hauptbahnhof"), "ICE 400": ("Berlin Hauptbahnhof", "München Hbf"),
                 "ICE 600": ("Frankfurt (Main) Hbf", "Hamburg Hbf")}


def berlin(d, hhmm, plus=0):
    h, m = map(int, hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m) + timedelta(minutes=plus)


def utc_of(local):
    return local.replace(tzinfo=BERLIN).astimezone(timezone.utc).replace(tzinfo=None)


def local_of(utc):
    return utc.replace(tzinfo=timezone.utc).astimezone(BERLIN).replace(tzinfo=None)


def st(t):
    return t.strftime("%y%m%d%H%M")


def stops():
    """Every stop event: dict with id, eva, train, times, delays and flags."""
    out = []
    for tt, num, trip, route, start, days in TRAINS:
        unit = f"{tt} {num}"
        for di in days:
            d = DAYS[di]
            t0 = berlin(d, start)
            delays = DELAYS.get((unit, di), [(None if a is None else 0, None if p is None else 0) for _, a, p in route])
            canc = CANCELLED.get((unit, di), [])
            for seq, ((name, a, p), (da, dd)) in enumerate(zip(route, delays)):
                out.append({"id": f"{trip}-{st(t0)}-{seq + 1 if seq < 2 else seq + 2}", "eva": EVA[name], "tt": tt, "num": num,
                            "arr": None if a is None else berlin(d, start, a), "dep": None if p is None else berlin(d, start, p),
                            "da": da, "dd": dd, "canc": canc == "all" or seq in canc,
                            "reinstated": seq in REINSTATED.get((unit, di), []), "extra": False, "repl": None,
                            "dest": route[-1][0]})
            if (unit, di) in DIVERSION:
                name, off = DIVERSION[(unit, di)]
                out.append({"id": f"{trip}-{st(t0)}-3", "eva": EVA[name], "tt": tt, "num": num,
                            "arr": berlin(d, start, off), "dep": berlin(d, start, off + 2), "da": 10, "dd": 10,
                            "canc": False, "reinstated": False, "extra": True, "repl": None, "dest": route[-1][0]})
    # A replacement train for ICE 100 on day 3, only in the change data.
    d = DAYS[3]
    for seq, (name, off) in enumerate([("Köln Hbf", 0), ("München Hbf", 280)]):
        out.append({"id": f"-9950-{st(berlin(d, '08:30'))}-{seq + 1}", "eva": EVA[name], "tt": "ICE", "num": "9500",
                    "arr": None if seq == 0 else berlin(d, "08:30", off), "dep": berlin(d, "08:30", off) if seq == 0 else None,
                    "da": 0, "dd": 0, "canc": False, "reinstated": False, "extra": False, "repl": ("ICE", "100"), "dest": "München Hbf"})
    return out


def when(s):
    """The stop's planned hour bucket (Berlin): departure, else arrival."""
    t = s["dep"] or s["arr"]
    return t.replace(minute=0)


def event_time(s):
    """When the stop actually happened (Berlin)."""
    if s["dep"] is not None:
        return s["dep"] + timedelta(minutes=s["dd"] or 0)
    return s["arr"] + timedelta(minutes=s["da"] or 0)


def plan_xml(station, items):
    body = []
    for s in items:
        tl = f'<tl f="F" t="p" o="80" c="{s["tt"]}" n="{s["num"]}"/>'
        ar = f'<ar pt="{st(s["arr"])}" pp="4" ppth="Vorher"/>' if s["arr"] else ""
        dp = f'<dp pt="{st(s["dep"])}" pp="4" ppth="Nachher|{s["dest"]}"/>' if s["dep"] else ""
        body.append(f'<s id="{s["id"]}">{tl}{ar}{dp}</s>')
    return f'<?xml version="1.0" encoding="UTF-8"?><timetable station="{station}">{"".join(body)}</timetable>'


def fchg_xml(station, items, snap_local):
    body = []
    for s in items:
        ev = event_time(s)
        # Kept for RETENTION after it happened; forecasts only shortly ahead.
        if not (ev - LOOKAHEAD <= snap_local <= ev + RETENTION):
            continue
        attrs = []
        for kind, plan, delay in (("ar", s["arr"], s["da"]), ("dp", s["dep"], s["dd"])):
            if plan is None:
                attrs.append("")
                continue
            a = ""
            if s["extra"] or s["repl"]:
                a += f' pt="{st(plan)}" ps="a"' if s["extra"] else f' pt="{st(plan)}"'
            happened = snap_local >= ev
            if s["canc"]:
                a += f' cs="c" clt="{st(plan - timedelta(hours=2))}"'
            elif s["reinstated"]:
                a += f' cs="p" clt="{st(plan - timedelta(hours=2))}" ct="{st(plan + timedelta(minutes=delay or 0))}"'
            elif delay or happened:
                # Before the event the forecast is half the final delay; after it, the final delay.
                d = (delay or 0) if happened else (delay or 0) // 2
                a += f' ct="{st(plan + timedelta(minutes=d))}"'
            attrs.append(f"<{kind}{a}/>" if a else "")
        tl = ""
        ref = ""
        if s["extra"]:
            tl = f'<tl f="F" t="p" o="80" c="{s["tt"]}" n="{s["num"]}"/>'
        if s["repl"]:
            tl = f'<tl f="F" t="e" o="80" c="{s["tt"]}" n="{s["num"]}"/>'
            ref = f'<ref><tl f="F" t="p" o="80" c="{s["repl"][0]}" n="{s["repl"][1]}"/></ref>'
        inner = tl + ref + "".join(attrs)
        if inner:
            body.append(f'<s id="{s["id"]}" eva="{int(s["eva"])}">{inner}</s>')
        else:
            body.append(f'<s id="{s["id"]}"><m id="r1" t="h" c="0"/></s>')  # messages only: skipped
    return f'<?xml version="1.0" encoding="UTF-8"?><timetable station="{station}">{"".join(body)}</timetable>'


def fetch_runs():
    start = datetime(2026, 10, 23, 3, 17)
    end = datetime(2026, 10, 31, 9, 17)
    t = start
    while t <= end:
        if t != MISSED_RUN:
            yield t
        t += timedelta(hours=6)


def build(out_dir):
    out_dir = Path(out_dir)
    events = stops()
    by_station_hour, by_station = {}, {}
    for s in events:
        by_station.setdefault(s["eva"], []).append(s)
        if not s["extra"] and not s["repl"]:
            by_station_hour.setdefault((s["eva"], when(s)), []).append(s)
    covered = set()
    files = {}
    for run in fetch_runs():
        now_local = local_of(run)
        cur = now_local.replace(minute=0, second=0)
        hours = [cur + timedelta(hours=k) for k in range(-9, 3)]
        todo = [h for h in hours if h not in covered and h != LOST_PLAN_HOUR]
        covered.update(todo)
        groups = {}
        for h in todo:
            groups.setdefault(h.date(), []).append(h)
        for d, hs in sorted(groups.items()):
            name = f"date_{d.isoformat()}_hour_{'_'.join(f'{h.hour:02d}' for h in sorted(hs))}.parquet"
            rows = files.setdefault((run.date(), name), [])
            ts = run + timedelta(minutes=3)
            rows.append(dict(timestamp=ts, url="https://apis.deutschebahn.com/db-api-marketplace/apis/station-data/v2/stations",
                             api_name="station-data/v2/stations", response_data='{"result": []}', status_code="200"))
            for i, (eva, name_) in enumerate(STATIONS.items()):
                snap = ts + timedelta(seconds=10 * i)
                rows.append(dict(timestamp=snap, url=f"{API}/fchg/{eva}", api_name="timetables/v1/fchg",
                                 response_data=fchg_xml(name_, by_station.get(eva, []), local_of(snap)), status_code="200"))
            rows.append(dict(timestamp=ts, url=f"{API}/fchg/08000003", api_name="timetables/v1/fchg",
                             response_data="", status_code="500"))
            for h in sorted(hs):
                for eva, name_ in STATIONS.items():
                    rows.append(dict(timestamp=ts + timedelta(minutes=5), url=f"{API}/plan/{eva}/{h:%y%m%d}/{h:%H}",
                                     api_name="timetables/v1/plan", status_code="200",
                                     response_data=plan_xml(name_, by_station_hour.get((eva, h), []))))
    schema = pa.schema([("timestamp", pa.timestamp("us")), ("url", pa.string()), ("api_name", pa.string()),
                        ("query_params", pa.string()), ("response_data", pa.string()), ("status_code", pa.string()),
                        ("error", pa.string()), ("duration_ms", pa.float64())])
    for (d, name), rows in files.items():
        folder = out_dir / "raw_data" / f"year={d.year}" / f"month={d.month}" / f"day={d.day}"
        folder.mkdir(parents=True, exist_ok=True)
        cols = {f.name: [r.get(f.name) for r in rows] for f in schema}
        cols["query_params"] = ["{}"] * len(rows)
        cols["duration_ms"] = [12.5] * len(rows)
        pq.write_table(pa.table(cols, schema=schema), folder / name)
    (out_dir / "names.json").write_text(json.dumps(NAMES, ensure_ascii=False), encoding="utf-8")
    return out_dir


if __name__ == "__main__":
    build(sys.argv[1])
    print(f"fixture written to {sys.argv[1]}")
