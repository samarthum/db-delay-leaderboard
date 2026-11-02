"""The monthly refresh end to end on synthetic months (tests/data/monthly_fixture.py): no network, ~1 minute.

  python tests/data/test_monthly.py

1. plan: acts only when the last finished month is published and not yet in stats.json.
2. run: the pipeline on June-September (the "committed" data), then with October added.
3. gate: passes for the real refresh; fails when the window does not move, a field vanishes, a route row runs the
   other way, or a family shrinks.
4. verify: tests/data/verify_monthly.py, verify_bins.py and scripts/check_headline.py agree with the new files, and
   verify_monthly.py catches planted errors (a backward route row, a changed search month, a train page count, a
   regional train number's month).
5. the route fix: ICE 517's reversed stop numbers give no backward row (the pre-fix rule would list it backwards).
6. the last-stop fix: rows numbered 100+ (ICE 703's diversion, ICE 702's and ICE 705's station listed twice) do not move
   where a run is measured; a third, plain-Python implementation of the rule agrees with the search records, and the old
   "last stop by stop number" rule would not.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY = sys.executable
passed, failed = 0, 0


def ok(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print(f"ok   {msg}", flush=True)
    else:
        failed += 1
        print(f"FAIL {msg}", flush=True)


def run(*cmd, env=None):
    r = subprocess.run([PY, *map(str, cmd)], cwd=ROOT, capture_output=True, text=True, env={**os.environ, **(env or {})})
    return r.returncode, r.stdout + r.stderr


def ride_delays(pq_dir, months, units):
    """{unit: (new-rule delays, old-rule delays)} of the measured runs, in plain Python (no DuckDB).

    New rule: drop a row when the same ride lists the same station at the same planned times under a lower stop number;
    the delay is at the measurable stop (not cancelled, planned arrival, delay known) with the latest planned arrival,
    then the highest stop number. Old rule: the measurable stop with the highest stop number, no duplicates dropped.
    """
    import pyarrow.parquet as pq_
    rides = {}
    for m in months:
        for r in pq_.read_table(Path(pq_dir) / f"data-{m}.parquet").to_pylist():
            unit = f"{r['train_type']} {r['train_number']}"
            if unit in units and not r["is_replacement_train"]:
                rides.setdefault((unit, r["id"].rsplit("-", 1)[0]), []).append(r)
    out = {u: ([], []) for u in units}
    for (unit, _), rs in rides.items():
        start = min(r["departure_planned_time"] or r["arrival_planned_time"] for r in rs)
        if start.strftime("%Y-%m") not in months:
            continue
        low = {}
        for r in rs:
            k = (r["station_name"], r["arrival_planned_time"], r["departure_planned_time"])
            low[k] = min(low.get(k, 10 ** 9), r["train_line_station_num"])
        kept = [r for r in rs if low[(r["station_name"], r["arrival_planned_time"], r["departure_planned_time"])] == r["train_line_station_num"]]

        def measurable(r):
            return not (r["arrival_is_canceled"] or r["departure_is_canceled"]) and r["arrival_planned_time"] and r["arrival_change_time"]
        for rule, rows_, key in ((0, kept, lambda r: (r["arrival_planned_time"], r["train_line_station_num"])),
                                 (1, rs, lambda r: r["train_line_station_num"])):
            cand = [r for r in rows_ if measurable(r)]
            if cand:
                r = max(cand, key=key)
                d = int((r["arrival_change_time"] - r["arrival_planned_time"]).total_seconds() // 60)
                if -10 <= d <= 600:
                    out[unit][rule].append(d)
    return out


def edit(path, fn):
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    fn(doc)
    Path(path).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main():
    tmp = Path(tempfile.mkdtemp(prefix="gp-monthly-"))
    pq, pq4, old, new = tmp / "pq", tmp / "pq4", tmp / "old", tmp / "new"
    try:
        code, out = run("tests/data/monthly_fixture.py", pq, "2026-06", "2026-07", "2026-08", "2026-09", "2026-10")
        assert code == 0, out
        pq4.mkdir()
        for m in ("06", "07", "08", "09"):
            os.symlink(pq / f"data-2026-{m}.parquet", pq4 / f"data-2026-{m}.parquet")
        csv = pq / "stations.csv"

        # 2. run
        old.mkdir()
        code, out = run("scripts/monthly.py", "run", "--data-dir", pq4, "--out-dir", old, "--stations-csv", csv)
        ok(code == 0, "pipeline on June-September" + ("" if code == 0 else "\n" + out[-3000:]))
        shutil.copytree(old, new)
        code, out = run("scripts/monthly.py", "run", "--data-dir", pq, "--out-dir", new, "--stations-csv", csv, "--until", "2026-10")
        ok(code == 0, "pipeline with October added" + ("" if code == 0 else "\n" + out[-3000:]))
        w = json.loads((new / "stats.json").read_text())["window"]
        ok((w["firstMonth"], w["lastMonth"], w["monthCount"]) == ("2026-06", "2026-10", 5), f"window {w['firstMonth']}..{w['lastMonth']}")
        (tmp / "capped").mkdir()
        code, out = run("scripts/monthly.py", "run", "--data-dir", pq, "--out-dir", tmp / "capped", "--stations-csv", csv, "--until", "2026-09")
        w = json.loads((tmp / "capped" / "stats.json").read_text())["window"]
        ok(code == 0 and w["lastMonth"] == "2026-09", f"--until 2026-09 leaves October out ({w['lastMonth']})")

        # 1. plan
        listing = tmp / "listing.json"
        for published, today, stats, want in [
            (["2026-08", "2026-09", "2026-10"], "2026-11-02", old, "act=true"),
            (["2026-08", "2026-09"], "2026-11-02", old, "act=false"),  # October not published yet
            (["2026-08", "2026-09", "2026-10"], "2026-11-05", new, "act=false"),  # already refreshed
            (["2026-09", "2026-10", "2026-11"], "2026-12-03", old, "act=true"),  # two behind: acts, the gate will refuse
        ]:
            listing.write_text(json.dumps(published))
            code, out = run("scripts/monthly.py", "plan", "--today", today, "--stats", stats / "stats.json", "--listing", listing)
            ok(code == 0 and want in out, f"plan {today}, published up to {published[-1]}, window ends "
               f"{json.loads((stats / 'stats.json').read_text())['window']['lastMonth']}: {want}")
        listing.write_text(json.dumps(["2026-08", "2026-09", "2026-10"]))
        code, out = run("scripts/monthly.py", "plan", "--today", "2026-11-02", "--stats", old / "stats.json", "--listing", listing, "--recompute")
        ok(code == 0 and all(x in out for x in ("act=true", "expect=recompute", "until=2026-09", "recompute=true")),
           "plan --recompute: acts on the committed window (until 2026-09) even with October out")
        code, out = run("scripts/monthly.py", "plan", "--today", "2026-11-02", "--stats", old / "stats.json", "--listing", listing)
        ok("recompute=false" in out and "expect=advance" in out, "plan without --recompute: a normal refresh")

        # 3. gate
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", new)
        ok(code == 0 and "All" in out, "gate passes the refresh" + ("" if code == 0 else "\n" + out[-3000:]))
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", old)
        ok(code == 1 and "FAIL window end moved forward" in out, "gate refuses a window that did not move")
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", old, "--expect", "same")
        ok(code == 0, "gate --expect same passes a recompute of the same window")
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", old, "--expect", "recompute")
        ok(code == 0 and "runs per month unchanged" in out, "gate --expect recompute passes the same window")
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", new, "--expect", "recompute")
        ok(code == 1 and "FAIL window unchanged" in out, "gate --expect recompute refuses a window that moved")

        def mutated(label, fn):
            m = tmp / label
            if m.exists():
                shutil.rmtree(m)
            shutil.copytree(new, m)
            fn(m)
            return m

        def recompute_bad(d):
            def f(doc):
                doc["series"]["longDistance"][0]["runs"] += 1
                doc["series"]["regional"][1]["avgDelayMin"] += 2.5
            edit(d / "monthly.json", f)
        m = tmp / "recompute-bad"
        shutil.copytree(old, m)
        recompute_bad(m)
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", m, "--expect", "recompute")
        ok(code == 1 and "FAIL longDistance: runs per month unchanged" in out and "FAIL regional: monthly average moved" in out,
           "gate --expect recompute refuses a lost run and a month moving 2.5 min")
        m = mutated("nofield", lambda d: edit(d / "routes.json", lambda doc: [r.pop("late6") for r in doc["routes"]]))
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", m)
        ok(code == 1 and "routes.json: no field vanished" in out and "late6" in out, "gate refuses a vanished field (routes late6)")
        m = mutated("shortrec", lambda d: [edit(p, lambda doc: [r.pop() for r in doc]) for p in (d / "search").glob("s-*.json")])
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", m)
        ok(code == 1 and "FAIL search records keep all" in out, "gate refuses search records that lost a position")

        def few_routes(doc):
            doc["routes"] = doc["routes"][: len(doc["routes"]) // 2]
        m = mutated("fewroutes", lambda d: edit(d / "routes.json", few_routes))
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", m)
        ok(code == 1 and "FAIL route pages" in out, "gate refuses half the route pages gone")

        def backward_row(doc):
            row = doc["routes"][0]["list"][0]
            row[3] = (row[2] - 60) % 1440
        m = mutated("backward", lambda d: edit(d / "routes.json", backward_row))
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", m)
        ok(code == 1 and "FAIL route lists: 1 rows" in out, "gate refuses a route row running the other way")

        # 4. verify
        code, out = run("tests/data/verify_monthly.py", "--parquet", pq, "--data", new, "--sample", "1000")
        ok(code == 0 and "0 differences" in out.splitlines()[-1], "verify_monthly: new files agree with the Parquet" + ("" if code == 0 else "\n" + out[-3000:]))
        code, out = run("tests/data/verify_bins.py", env={"GP_PARQUET": str(pq), "GP_DATA": str(new)})
        ok(code == 0 and "differences 0" in out, "verify_bins: connection pairs agree" + ("" if code == 0 else "\n" + out[-2000:]))
        code, out = run("scripts/check_headline.py", "--data-dir", pq, "--stats", new / "stats.json")
        ok(code == 0, "check_headline: headline agrees" + ("" if code == 0 else "\n" + out[-2000:]))
        code, out = run("tests/data/verify_monthly.py", "--parquet", pq, "--data", m)
        ok(code == 1 and "DIFF routes.json: no row runs the other way" in out, "verify_monthly catches a backward route row")

        def tamper_search(d):
            done = set()
            for p in sorted((d / "search").glob("s-*.json")):
                def f(doc):
                    for r in doc:
                        if r[2] == 0 and r[17] and 0 not in done:
                            r[17][-1][2] = round(r[17][-1][2] + 0.2, 1)
                            done.add(0)
                        elif r[2] == 2 and r[17] and 2 not in done:
                            r[17][-1][1] += 1
                            done.add(2)
                edit(p, f)
        m = mutated("search", tamper_search)
        code, out = run("tests/data/verify_monthly.py", "--parquet", pq, "--data", m)
        ok(code == 1 and "DIFF search kind 0" in out and "DIFF search kind 2" in out,
           "verify_monthly catches a changed latest month (train and regional number)")
        m = mutated("trainpage", lambda d: edit(sorted((d / "trains").glob("*.json"))[0], lambda t: t["monthly"][-1].__setitem__("runs", t["monthly"][-1]["runs"] + 1)))
        code, out = run("tests/data/verify_monthly.py", "--parquet", pq, "--data", m)
        ok(code == 1 and "DIFF trains/*.json" in out, "verify_monthly catches a train page's month count")

        # 5. the route fix
        routes = json.loads((new / "routes.json").read_text())
        rows517 = [(r["slug"], x[2], x[3]) for r in routes["routes"] for x in r["list"] if x[1] == "517"]
        ok(rows517 and all((a - d) % 1440 <= 720 for _, d, a in rows517), f"ICE 517 listed only in its direction ({len(rows517)} rows)")
        ok(not any(s.startswith(("ulm-hbf-k", "ulm-hbf-f", "stuttgart-hbf-f", "stuttgart-hbf-k", "frankfurt-hbf-k")) for s, _, _ in rows517),
           "ICE 517 not on the reverse-direction routes (Ulm -> Köln, Frankfurt -> Köln ...)")
        recent = [r for p in (new / "search").glob("s-*.json") for r in json.loads(p.read_text()) if r[2] == 0 and r[0] == "ICE" and r[1] == "517"]
        ok(recent and [m_[0] for m_ in recent[0][17]] == ["2026-08", "2026-09", "2026-10"], "search: ICE 517 has its last 3 months")
        lines = [r for p in (new / "search").glob("s-*.json") for r in json.loads(p.read_text()) if r[2] == 1]
        ok(lines and all(len(r[17]) <= 1 for r in lines), "search: regional lines keep only the latest month")

        # 6. the last-stop fix (rows numbered 100+)
        months = json.loads((new / "stats.json").read_text())["window"]["months"]
        units = ["ICE 703", "ICE 702", "ICE 705"]
        mine = ride_delays(pq, months, units)
        recs = {f"{r[0]} {r[1]}": r for p in (new / "search").glob("s-*.json") for r in json.loads(p.read_text()) if r[2] == 0}
        for u in units:
            new_d, old_d = mine[u]
            avg_new, avg_old = sum(new_d) / len(new_d), sum(old_d) / len(old_d)
            rec = recs[u]
            ok(rec[4] == len(new_d) and abs(rec[5] - avg_new) <= 0.05,
               f"{u}: search record {rec[4]} runs, avg {rec[5]} = plain-Python rule {len(new_d)}, {avg_new:.2f}")
            ok(abs(avg_old - avg_new) > 0.05, f"{u}: the stop-number rule would differ (avg {avg_old:.2f})")
        stops = json.loads((new / "stops.json").read_text())
        t702 = next(t for t in stops["trains"] if t[:2] == ["ICE", "702"])
        counts = {stops["stations"][x[0]]: x[3] for x in t702[2]}
        ok(counts.get("Hannover Hbf") == counts.get("Hamburg Hbf"), f"stops.json ICE 702: Hannover counted once per run {counts}")
        old703 = ride_delays(pq, months, ["ICE 703"])["ICE 703"][1]

        def old_rule_703(d):
            for p in sorted((d / "search").glob("s-*.json")):
                edit(p, lambda doc: [r.__setitem__(5, round(sum(old703) / len(old703), 1)) for r in doc if r[2] == 0 and r[:2] == ["ICE", "703"]])
        m = mutated("oldrule", old_rule_703)
        code, out = run("tests/data/verify_monthly.py", "--parquet", pq, "--data", m)
        ok(code == 1 and "DIFF search kind 0" in out and "ICE 703 avg" in out,
           "verify_monthly catches ICE 703's average measured at its highest stop number (Stendal on Mondays)")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
