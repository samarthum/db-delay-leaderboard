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

        # 3. gate
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", new)
        ok(code == 0 and "All" in out, "gate passes the refresh" + ("" if code == 0 else "\n" + out[-3000:]))
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", old)
        ok(code == 1 and "FAIL window end moved forward" in out, "gate refuses a window that did not move")
        code, out = run("scripts/monthly.py", "gate", "--old", old, "--new", old, "--expect", "same")
        ok(code == 0, "gate --expect same passes a recompute of the same window")

        def mutated(label, fn):
            m = tmp / label
            if m.exists():
                shutil.rmtree(m)
            shutil.copytree(new, m)
            fn(m)
            return m

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
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
