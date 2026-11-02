#!/usr/bin/env python3
"""scripts/abroad_history.py and tests/data/verify_abroad_history.py on synthetic Rijden de Treinen files (no network).

  python tests/data/test_abroad_history.py

Builds two months of services files in RdT's own layout (ICE 121 Amsterdam -> Frankfurt with Dutch and German stops,
a cancelled stop, a delay outside the clamp, a missing delay, a month outside the window, a domestic Intercity, a train
the site does not know), runs the script and the verifier, checks figures by hand, then plants an error and expects
the verifier to catch it.
"""
import csv
import gzip
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEAD = ["Service:RDT-ID", "Service:Date", "Service:Type", "Service:Company", "Service:Train number", "Service:Completely cancelled",
        "Service:Partly cancelled", "Service:Maximum delay", "Stop:RDT-ID", "Stop:Station code", "Stop:Station name",
        "Stop:Arrival time", "Stop:Arrival delay", "Stop:Arrival cancelled", "Stop:Departure time", "Stop:Departure delay",
        "Stop:Departure cancelled", "Stop:Platform change", "Stop:Planned platform", "Stop:Actual platform"]
STATIONS = [("ASD", "Amsterdam Centraal", "NL"), ("UT", "Utrecht Centraal", "NL"), ("AH", "Arnhem Centraal", "NL"),
            ("OBH", "Oberhausen Hbf", "D"), ("HT", "'s-Hertogenbosch", "NL")]
NAME = {c: n for c, n, _ in STATIONS}
checks = 0
fails = 0


def ok(cond, msg):
    global checks, fails
    checks += 1
    if not cond:
        fails += 1
        print("FAIL", msg)


def run_rows(sid, date, typ, num, stops):
    """stops: [(code, arr time|'', arr delay|'', arr canc, dep time|'', dep delay|'', dep canc)]"""
    out = []
    for i, (code, at, ad, ac, dt, dd, dc) in enumerate(stops):
        out.append([sid, date, typ, "NS Int", num, "false", "false", "0", str(sid * 100 + i), code, NAME[code], at, ad,
                    ac, dt, dd, dc, "false", "", ""])
    return out


def main():
    tmp = Path(tempfile.mkdtemp(prefix="abroad-hist-"))
    cache = tmp / "cache"
    cache.mkdir()
    with open(cache / "rdt-stations-2023-09.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "code", "uic", "name_short", "name_medium", "name_long", "slug", "country", "type", "geo_lat", "geo_lng"])
        for i, (c, n, cc) in enumerate(STATIONS):
            w.writerow([i, c, "", n, n, n, n.lower(), cc, "x", 0, 0])
    months = ["2026-01", "2026-02"]
    rows = {m: [] for m in months + ["2025-12"]}
    sid = 1
    # ICE 121, 25 runs a month: Amsterdam departure delay = day % 4, Utrecht arrival delay = day (0..24) so 10 of 25
    # are 15+; Arnhem: day 3 cancelled, day 5 delay 700 (outside the clamp), day 7 no delay recorded.
    for m in months:
        for day in range(1, 26):
            date = f"{m}-{day:02d}"
            ah = ("AH", f"{date}T08:00:00+01:00", "700" if day == 5 else ("" if day == 7 else str(day % 6)), "true" if day == 3 else "false",
                  f"{date}T08:02:00+01:00", str(day % 6), "true" if day == 3 else "false")
            rows[m] += run_rows(sid, date, "ICE", "121", [
                ("ASD", "", "", "", f"{date}T06:00:00+01:00", str(day % 4), "false"),
                ("UT", f"{date}T06:25:00+01:00", str(day - 1), "false", f"{date}T06:28:00+01:00", str(day - 1), "false"),
                ah,
                ("OBH", f"{date}T09:00:00+01:00", "50", "false", f"{date}T09:02:00+01:00", "50", "false")])
            sid += 1
            # A domestic Intercity whose number DB also uses: never calls in Germany, so it must not count.
            rows[m] += run_rows(sid, date, "Intercity", "3000", [("UT", "", "", "", f"{date}T07:00:00+01:00", "9", "false"), ("HT", f"{date}T07:30:00+01:00", "99", "false", "", "", "")])
            sid += 1
            rows[m] += run_rows(sid, date, "ICE", "9999", [("ASD", "", "", "", f"{date}T06:00:00+01:00", "30", "false"), ("OBH", f"{date}T08:25:00+01:00", "30", "false", "", "", "")])
            sid += 1
    rows["2025-12"] += run_rows(sid, "2025-12-31", "ICE", "121", [("ASD", "", "", "", "2025-12-31T06:00:00+01:00", "99", "false"), ("UT", "2025-12-31T06:25:00+01:00", "99", "false", "", "", "")])
    for m, rs in rows.items():
        with gzip.open(cache / f"rdt-services-{m}.csv.gz", "wt", newline="") as f:
            w = csv.writer(f)
            w.writerow(HEAD)
            w.writerows(rs)
    # Belgium (Infrabel layout): ICE 10 Frankfurt -> Bruxelles Midi, 30 runs a month. Liège is a stop (planned wait),
    # Hergenrath a passing point (arrival = departure), Bruxelles Midi the end (no departure). Delays in seconds.
    be_head = ["DATDEP", "CIRC_TYP", "TRAIN_NO", "RELATION", "TRAIN_SERV", "OP1_COD", "THOP1_COD", "PTCAR_NO", "PTCAR_LG_NM_NL", "LINE_NO_DEP",
               "REAL_DATE_ARR", "REAL_TIME_ARR", "REAL_DATE_DEP", "REAL_TIME_DEP", "PLANNED_DATE_ARR", "PLANNED_TIME_ARR", "PLANNED_TIME_DEP",
               "PLANNED_DATE_DEP", "DELAY_ARR", "DELAY_DEP", "RELATION_DIRECTION", "LINE_NO_ARR"]
    mon = {"2026-01": "JAN2026", "2026-02": "FEB2026"}
    for m in months:
        with open(cache / f"infrabel-{m}.csv", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(be_head)
            for day in range(1, 31 if m == "2026-01" else 29):
                d = f"{day:02d}{mon[m]}"
                common = [d, "1", "10", "ICE", "SNCB/NMBS", "=", "="]
                w.writerow(common + ["825", "HERGENRATH", "37", d, "", d, "", d, "16:28:00", "16:28:00", d, str(day * 60), str(day * 60), "ICE: FRANKFURT(MAIN) HBF -> BRUSSEL-ZUID", "37"])
                # Liège: arrival delay = day * 59 s (floor -> day - 1 min for day >= 1), 15+ from day 16 on
                w.writerow(common + ["726", "LIEGE-GUILLEMINS", "36", d, "", d, "", d, "16:50:00", "16:53:00", d, str(day * 59), str(day * 59), "", "36"])
                w.writerow(common + ["1", "BRUSSEL-ZUID", "", d, "", "", "", d, "17:45:00", "", "", "-30", "", "", ""])
                # an IC with a number DB also uses: not an ICE in Belgium, never counted
                w.writerow([d, "1", "121", "IC 01", "SNCB/NMBS", "=", "=", "1", "BRUSSEL-ZUID", "", d, "", "", "", d, "09:00:00", "", "", "600", "", "", ""])
    stats = {"window": {"firstMonth": months[0], "lastMonth": months[-1], "monthCount": 2, "months": months},
             "params": {"clampMinMinutes": -10, "clampMaxMinutes": 600, "lateMinutes": 15}}
    (tmp / "stats.json").write_text(json.dumps(stats))
    (tmp / "stops.json").write_text(json.dumps({"trains": [["ICE", "121", []], ["IC", "3000", []], ["ICE", "10", []]]}))
    out = tmp / "abroad-history.json"
    py = sys.executable
    r = subprocess.run([py, str(ROOT / "scripts/abroad_history.py"), "--stats", str(tmp / "stats.json"), "--stops", str(tmp / "stops.json"),
                        "--cache", str(cache), "--out", str(out)], capture_output=True, text=True)
    ok(r.returncode == 0, "script runs: " + r.stderr[-800:])
    doc = json.loads(out.read_text())
    t = doc["trains"].get("ICE 121", {})
    ok(set(t) == {"Amsterdam Centraal", "Utrecht Centraal", "Arnhem Centraal"}, f"Dutch stops only: {sorted(t)}")
    ok("ICE 9999" not in doc["trains"], "unknown train left out")
    ok("IC 3000" not in doc["trains"], "domestic run with a DB number left out")
    u = t.get("Utrecht Centraal")
    # 50 runs, delays 0..24 twice; 15+ = 15..24 -> 10 per month = 20 of 50 = 40%; mean 12.0; no departure figures there.
    ok(u == ["NL", 50, 50, 40.0, 12.0, 0, None, None, 0.0], f"Utrecht {u}")
    asd = t.get("Amsterdam Centraal")
    # starts there: no arrival; departure delays day % 4 over 1..25 twice: mean = (2*(1+2+3+0)*6 + 2*1)/50
    dep = [d % 4 for d in range(1, 26)] * 2
    ok(asd == ["NL", 50, 0, None, None, 50, 0.0, round(sum(dep) / 50, 1), 0.0], f"Amsterdam {asd}")
    ah = t.get("Arnhem Centraal")
    # 50 runs; 2 cancelled (day 3), 2 outside clamp (day 5), 2 without delay (day 7): 44 measured, all under 15 min.
    arr = [d % 6 for d in range(1, 26) if d not in (3, 5, 7)] * 2
    ok(ah == ["NL", 50, 44, 0.0, round(sum(arr) / 44, 1), 0, None, None, 4.0], f"Arnhem {ah}")
    ok(doc["sources"]["NL"]["months"] == months and doc["window"]["months"] == months, "window = site window")
    be = doc["trains"].get("ICE 10", {})
    ok(set(be) == {"Liège-Guillemins", "Bruxelles Midi"}, f"BE stops only (no passing point): {sorted(be)}")
    lg = [d * 59 // 60 for d in range(1, 31)] + [d * 59 // 60 for d in range(1, 29)]
    ok(be.get("Liège-Guillemins") == ["BE", 58, 58, round(100 * sum(x >= 15 for x in lg) / 58, 1), round(sum(lg) / 58, 1), 0, None, None, None],
       f"Liège {be.get('Liège-Guillemins')}")
    ok(be.get("Bruxelles Midi") == ["BE", 58, 58, 0.0, 0.0, 0, None, None, None], f"Bruxelles Midi (30 s early -> 0 min) {be.get('Bruxelles Midi')}")
    ok("BE" in doc["sources"] and doc["sources"]["BE"]["licence"] == "CC0", "Infrabel credited")
    r = subprocess.run([py, str(ROOT / "tests/data/verify_abroad_history.py"), "--cache", str(cache), "--json", str(out), "--stats", str(tmp / "stats.json"), "--stops", str(tmp / "stops.json")],
                       capture_output=True, text=True)
    ok(r.returncode == 0 and "0 differences" in r.stdout, "verifier agrees: " + r.stdout[-500:])
    doc["trains"]["ICE 121"]["Utrecht Centraal"][3] = 41.0
    bad = tmp / "bad.json"
    bad.write_text(json.dumps(doc))
    r = subprocess.run([py, str(ROOT / "tests/data/verify_abroad_history.py"), "--cache", str(cache), "--json", str(bad), "--stats", str(tmp / "stats.json"), "--stops", str(tmp / "stops.json")],
                       capture_output=True, text=True)
    ok(r.returncode == 1 and "1 differences" in r.stdout, "planted error caught: " + r.stdout[-300:])
    print(f"abroad history: {checks - fails} of {checks} checks passed")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
