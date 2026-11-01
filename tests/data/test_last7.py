#!/usr/bin/env python3
"""Fixture tests for scripts/last7.py and tests/data/verify_last7.py. No network, no real data.

  python tests/data/test_last7.py        (or: python -m pytest tests/data/test_last7.py)
Needs duckdb, pyarrow and lxml (scripts/requirements.txt).
"""
import json
import subprocess
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "tests" / "data"))

import last7  # noqa: E402
import last7_fixture as fx  # noqa: E402

TMP = Path(tempfile.mkdtemp(prefix="gp-last7-test-"))
fx.build(TMP)
RAW, NAMES, OUT = TMP / "raw_data", TMP / "names.json", TMP / "last7.json"


def run(*args):
    return subprocess.run([sys.executable, *args], capture_output=True, text=True, cwd=ROOT)


r = run("scripts/last7.py", "--data-dir", str(RAW), "--names", str(NAMES), "--out", str(OUT))
assert r.returncode == 0, r.stderr
DOC = json.loads(OUT.read_text(encoding="utf-8"))


def test_window_is_the_seven_complete_days():
    assert DOC["days"] == [d.isoformat() for d in fx.DAYS]
    assert DOC["asOf"] == "2026-10-30"


def test_every_cell_matches_the_hand_worked_table():
    assert set(DOC["trains"]) == set(fx.EXPECTED), sorted(DOC["trains"])
    for unit, want in fx.EXPECTED.items():
        assert DOC["trains"][unit][2] == want, (unit, DOC["trains"][unit][2], want)


def test_usual_ends_are_named():
    st = DOC["stations"]
    for unit, (o, d) in fx.EXPECTED_ENDS.items():
        assert (st[DOC["trains"][unit][0]], st[DOC["trains"][unit][1]]) == (o, d), unit


def test_regional_and_replacement_trains_are_left_out():
    assert "RE 5" not in DOC["trains"] and "ICE 9500" not in DOC["trains"]


def test_missing_hours_are_listed():
    assert DOC["gaps"] == {"2026-10-27": list(range(10, 23)), "2026-10-29": [3]}


def test_the_gap_rule_is_what_keeps_lost_delays_from_reading_as_none():
    # Without the missing-hours rule, ICE 100 on 27 Oct would read 4 min at München: the forecast from the last change
    # list before it arrived. Its real 9 min were never in a list that survived the missed fetch run.
    files = sorted(last7.local_files(RAW), key=lambda p: (last7.folder_day(p), p.name))
    plan, fchg, snaps = last7.extract(files, json.loads(NAMES.read_text()), last7.timezone.utc)
    runs = last7.compute_runs(plan, fchg, fx.DAYS, set())
    ice100 = [x for x in runs if x["unit"] == "ICE 100" and x["day"] == date(2026, 10, 27)][0]
    assert ice100["arr"]["delay"] == 4 and not ice100["gap"]


def test_verifier_agrees_and_catches_a_one_minute_change():
    ok = run("tests/data/verify_last7.py", "--raw", str(RAW), "--json", str(OUT), "--names", str(NAMES), "--all")
    assert ok.returncode == 0, ok.stdout + ok.stderr
    bad = json.loads(OUT.read_text(encoding="utf-8"))
    bad["trains"]["ICE 600"][2][5] = [2, 13]
    (TMP / "bad.json").write_text(json.dumps(bad), encoding="utf-8")
    no = run("tests/data/verify_last7.py", "--raw", str(RAW), "--json", str(TMP / "bad.json"), "--names", str(NAMES), "--all")
    assert no.returncode == 1 and "ICE 600 2026-10-29" in no.stdout, no.stdout


def verify(doc, name):
    (TMP / name).write_text(json.dumps(doc), encoding="utf-8")
    return run("tests/data/verify_last7.py", "--raw", str(RAW), "--json", str(TMP / name), "--names", str(NAMES), "--all")


def test_a_day_without_a_first_stop_is_not_the_usual_first_stop():
    # The first real dry run's one difference (EC 1216, 25 Oct 2026): that day's run had no stop with a planned
    # departure, and the file left the first stop out, which reads as "the usual one" (München Ost).
    assert DOC["trains"]["EC 1216"][2][1] == [None, None, last7.NO_STOP, None]
    old = json.loads(OUT.read_text(encoding="utf-8"))
    old["trains"]["EC 1216"][2][1] = [None, None]  # the old encoding
    no = verify(old, "old.json")
    assert no.returncode == 1 and "EC 1216 2026-10-25" in no.stdout, no.stdout
    # And the other way: "no stop" on a day that had its usual first stop is caught too.
    wrong = json.loads(OUT.read_text(encoding="utf-8"))
    wrong["trains"]["EC 1216"][2][2] = [0, 0, last7.NO_STOP, None]
    no = verify(wrong, "wrong.json")
    assert no.returncode == 1 and "EC 1216 2026-10-26" in no.stdout, no.stdout


def test_sanity_check_gate():
    # The fixture is tiny, so the production thresholds reject it; relaxed thresholds accept it.
    assert last7.check(OUT) == 1
    fresh = json.loads(OUT.read_text(encoding="utf-8"))
    today = date.today()
    fresh["days"] = [(today - timedelta(days=7 - i)).isoformat() for i in range(7)]
    fresh["asOf"] = fresh["days"][-1]
    (TMP / "fresh.json").write_text(json.dumps(fresh), encoding="utf-8")
    assert last7.check(TMP / "fresh.json", min_trains=5, min_day_runs=3) == 0
    newer = dict(fresh, asOf=(today + timedelta(days=1)).isoformat())
    (TMP / "newer.json").write_text(json.dumps(newer), encoding="utf-8")
    assert last7.check(TMP / "fresh.json", previous=TMP / "newer.json", min_trains=5, min_day_runs=3) == 1


def test_output_is_deterministic():
    again = TMP / "again.json"
    r2 = run("scripts/last7.py", "--data-dir", str(RAW), "--names", str(NAMES), "--out", str(again))
    assert r2.returncode == 0 and again.read_bytes() == OUT.read_bytes()


if __name__ == "__main__":
    tests = [(k, v) for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"ok   {name}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL {name}: {e}")
    print(f"{len(tests) - failed} of {len(tests)} passed")
    sys.exit(1 if failed else 0)
