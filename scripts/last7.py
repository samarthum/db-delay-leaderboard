#!/usr/bin/env python3
"""Last 7 days per long-distance train, from piebro/deutsche-bahn-data's RAW files (updated every 6 hours).

Writes data/last7.json: for every long-distance train number seen in the last 7 complete service days, per day the
departure delay at its first German stop and the arrival delay at its last German stop (or cancelled, or no run in the
data, or data incomplete). Shape and rules: docs/notes/data-pipeline.md ("Last 7 days").

The raw files hold Deutsche Bahn Timetables API answers (XML), not stop rows: every 6 hours piebro's job saves the
planned timetable (`plan`, per station and hour) and the full change list (`fchg`, per station). This script turns them
into stop rows the same way piebro's monthly job does (scripts/parse_monthly_xml.py + create_monthly_data_release.py
in github.com/piebro/deutsche-bahn-data: latest snapshot per stop id, plan and change merged, a stop without a change
record counts as its planned time) and then applies compute.py's scope rules (same train types, no replacement trains,
a run belongs to the day of its scheduled start, delays outside -10..600 min are not measured).

  python scripts/last7.py                       # list + download the needed raw files from Hugging Face
  python scripts/last7.py --data-dir DIR        # read a local raw_data tree (year=Y/month=M/day=D/*.parquet)
  python scripts/last7.py --check data/last7.json [--previous OLD]   # sanity checks only (used by the workflow)
"""
import argparse
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from lxml import etree

HF_TREE = "https://huggingface.co/api/datasets/piebro/deutsche-bahn-data/tree/main/"
HF_FILE = "https://huggingface.co/datasets/piebro/deutsche-bahn-data/resolve/main/"
EVA_NAMES = "https://raw.githubusercontent.com/piebro/deutsche-bahn-data/main/config/eva_to_station_name.json"
USER_AGENT = "german-punctuality (https://german-punctuality.vercel.app)"
BERLIN = ZoneInfo("Europe/Berlin")

# Same list as scripts/compute.py PARAMS["longDistanceTypes"].
LONG_DISTANCE = ["ICE", "IC", "EC", "ECE", "RJ", "RJX", "FLX", "TGV", "WB"]
CLAMP_MIN, CLAMP_MAX = -10, 600  # compute.py clampMinMinutes / clampMaxMinutes
DAYS = 7
# A service day is complete once a change snapshot exists from the next morning: piebro's 09:17 UTC fetch is the first
# one after the last overnight arrivals (about 07:00-08:00 Berlin). See docs/notes/data-pipeline.md.
COMPLETE_AFTER = timedelta(days=1, hours=10)
# Change snapshots reach back about 6 hours (piebro's README: "reaching back longer than 6 hours"). Two fetch runs
# further apart than this leave a stretch whose final delays may be lost: runs in it are flagged, never shown as fine.
MAX_SNAPSHOT_GAP = timedelta(hours=7)
RETENTION = timedelta(hours=6)
# A run is flagged when a missing hour falls between its start and this long after its last planned time.
GAP_TAIL = timedelta(hours=2)

DATED_FILE_RE = re.compile(r"(?:^|/)date_(\d{4}-\d{2}-\d{2})_hour_((?:\d{2})(?:_\d{2})*)\.parquet$")
LEGACY_FILE_RE = re.compile(r"(?:^|/)year=(\d{4})/month=(\d{1,2})/day=(\d{1,2})/hour_((?:\d{2})(?:_\d{2})*)\.parquet$")
FOLDER_RE = re.compile(r"year=(\d{4})/month=(\d{1,2})/day=(\d{1,2})")
LD_TEXT = re.compile(r'\bc="(?:' + "|".join(LONG_DISTANCE) + r')"')
RIDE_RE = re.compile(r"^(.*-\d{10})-\d+$")  # compute.py RUN_KEY: everything before the start stamp's stop number


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- files

def folder_day(path):
    m = FOLDER_RE.search(str(path).replace(os.sep, "/"))
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def plan_hours_of(path):
    """Berlin hour buckets whose plan a raw file holds, read from its name (as piebro's find_missing_raw_data_hours)."""
    p = str(path).replace(os.sep, "/")
    m = DATED_FILE_RE.search(p)
    if m:
        d, hours = datetime.strptime(m.group(1), "%Y-%m-%d"), m.group(2)
    else:
        m = LEGACY_FILE_RE.search(p)
        if not m:
            return set()
        d, hours = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))), m.group(4)
    return {d.replace(hour=int(h)) for h in hours.split("_")}


def get_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp), resp.headers


def list_remote(days):
    """[(relative path, size)] of raw files in the given fetch-day folders (UTC, as piebro partitions them)."""
    out = []
    for d in days:
        folder = f"raw_data/year={d.year}/month={d.month}/day={d.day}"
        url = HF_TREE + urllib.parse.quote(folder, safe="/=")
        while url:
            try:
                entries, headers = get_json(url)
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    break
                raise
            out += [(e["path"], int(e.get("size") or 0)) for e in entries if e.get("type") == "file" and e["path"].endswith(".parquet")]
            m = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link") or "")
            url = m.group(1) if m else None
    return sorted(out)


def download(rel, size, cache):
    path = cache / rel
    if path.exists() and (not size or path.stat().st_size == size):
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    t0 = time.time()
    for attempt in range(4):
        try:
            req = urllib.request.Request(HF_FILE + urllib.parse.quote(rel, safe="/="), headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=300) as resp, open(tmp, "wb") as f:
                shutil.copyfileobj(resp, f, 1 << 20)
            break
        except (urllib.error.URLError, OSError) as e:
            if attempt == 3:
                raise
            log(f"download {rel} failed ({e}), retrying")
            time.sleep(2 ** (attempt + 1))
    os.replace(tmp, path)
    log(f"downloaded {rel} ({path.stat().st_size / 1e6:.0f} MB) in {time.time() - t0:.0f}s")
    return path


def local_files(data_dir):
    return sorted(p for p in Path(data_dir).rglob("*.parquet") if folder_day(p) is not None)


def load_names(path):
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    try:
        return get_json(EVA_NAMES)[0]
    except Exception as e:  # noqa: BLE001 - the XML's own station name is the fallback
        log(f"station names: {e}; using the names in the XML")
        return {}


# ---------------------------------------------------------------- XML -> rows

def stamp(v):
    """DB's yyMMddHHmm (Berlin wall clock) -> naive datetime, None when absent or malformed."""
    if not v:
        return None
    try:
        return datetime.strptime(v, "%y%m%d%H%M")
    except ValueError:
        return None


def last_of_path(v):
    if v is None:
        return None
    return v.split("|")[-1] if v else None


def responses(path, api):
    """(eva, snapshot UTC naive, xml) of the successful answers of one API in one raw file."""
    pf = pq.ParquetFile(path)
    for batch in pf.iter_batches(batch_size=256, columns=["timestamp", "url", "api_name", "response_data", "status_code"]):
        b = batch.to_pydict()
        for ts, url, name, data, status in zip(b["timestamp"], b["url"], b["api_name"], b["response_data"], b["status_code"]):
            if name != api or str(status) != "200" or not data:
                continue
            eva = url.split(f"/{api}/", 1)[1].split("/")[0] if f"/{api}/" in url else ""
            yield eva, ts, data


PLAN_COLS = ["id", "eva", "station_name", "snap", "train_type", "train_number", "arr_pt", "dep_pt"]
FCHG_COLS = ["id", "eva", "station_name", "snap", "train_type", "train_number", "tl_t",
             "arr_pt", "arr_ct", "arr_clt", "arr_ps", "arr_cs", "dep_pt", "dep_ct", "dep_clt", "dep_ps", "dep_cs",
             "ref_type", "ref_number", "ref_label_type", "ref_owner", "ref_flags"]


def to_berlin(ts, snapshot_tz):
    if ts is None:
        return None
    if isinstance(ts, str):
        ts = datetime.fromisoformat(ts)
    return ts.replace(tzinfo=snapshot_tz).astimezone(BERLIN).replace(tzinfo=None)


def extract(files, names, snapshot_tz):
    """Long-distance stop snapshots from the raw files: plan rows first (they define the rides), then change rows."""
    plan, rides, ld_evas = [], set(), set()
    t0 = time.time()
    for path in files:
        for eva, ts, xml in responses(path, "timetables/v1/plan"):
            if not LD_TEXT.search(xml):
                continue
            root = etree.fromstring(xml.encode())
            xml_name = root.get("station")
            snap = to_berlin(ts, snapshot_tz)
            for s in root.findall("s"):
                tl = s.find("tl")
                if tl is None or tl.get("c") not in LONG_DISTANCE:
                    continue
                sid = s.get("id")
                ar, dp = s.find("ar"), s.find("dp")
                plan.append((sid, eva, names.get(eva) or xml_name, snap, tl.get("c"), tl.get("n"),
                             stamp(ar.get("pt")) if ar is not None else None, stamp(dp.get("pt")) if dp is not None else None))
                m = RIDE_RE.match(sid or "")
                if m:
                    rides.add(m.group(1))
                ld_evas.add(eva)
    log(f"plan: {len(plan)} long-distance stop snapshots, {len(rides)} rides, {len(ld_evas)} stations in {time.time() - t0:.0f}s")

    fchg, snaps = [], set()
    t0 = time.time()
    for path in files:
        for eva, ts, xml in responses(path, "timetables/v1/fchg"):
            snap = to_berlin(ts, snapshot_tz)
            snaps.add(snap)
            # Stations without a planned long-distance stop only matter for additional stops that name their train.
            if eva not in ld_evas and not LD_TEXT.search(xml):
                continue
            root = etree.fromstring(xml.encode())
            xml_name = root.get("station")
            for s in root.findall("s"):
                tl, ar, dp, ref = s.find("tl"), s.find("ar"), s.find("dp"), s.find("ref/tl")
                # piebro's parse_monthly_xml: elements without attributes only carry messages.
                if (not (ar is not None and ar.attrib) and not (dp is not None and dp.attrib) and ref is None
                        and (tl is None or tl.get("t") != "e")):
                    continue
                sid = s.get("id") or ""
                m = RIDE_RE.match(sid)
                if not ((m and m.group(1) in rides) or (tl is not None and tl.get("c") in LONG_DISTANCE)):
                    continue
                g = lambda el, k: el.get(k) if el is not None else None  # noqa: E731
                fchg.append((sid, eva, names.get(eva) or xml_name, snap, g(tl, "c"), g(tl, "n"), g(tl, "t"),
                             stamp(g(ar, "pt")), stamp(g(ar, "ct")), stamp(g(ar, "clt")), g(ar, "ps"), g(ar, "cs"),
                             stamp(g(dp, "pt")), stamp(g(dp, "ct")), stamp(g(dp, "clt")), g(dp, "ps"), g(dp, "cs"),
                             g(ref, "c"), g(ref, "n"), g(ref, "t"), g(ref, "o"), g(ref, "f")))
    log(f"fchg: {len(fchg)} long-distance change snapshots from {len(snaps)} station answers in {time.time() - t0:.0f}s")
    return plan, fchg, snaps


def table(rows, cols, types):
    return pa.table({c: pa.array([r[i] for r in rows], type=types.get(c, pa.string())) for i, c in enumerate(cols)})


TS = pa.timestamp("us")
PLAN_TYPES = {"snap": TS, "arr_pt": TS, "dep_pt": TS}
FCHG_TYPES = {"snap": TS, **{c: TS for c in ("arr_pt", "arr_ct", "arr_clt", "dep_pt", "dep_ct", "dep_clt")}}


# ---------------------------------------------------------------- timing: complete days and missing hours

def fetch_runs(snaps):
    """Start times of piebro's fetch runs: change snapshots closer than 90 minutes belong to one run."""
    runs = []
    for s in sorted(snaps):
        if not runs or s - runs[-1][1] > timedelta(minutes=90):
            runs.append([s, s])
        else:
            runs[-1][1] = s
    return [r[0] for r in runs]


def hour_floor(t):
    return t.replace(minute=0, second=0, microsecond=0)


def missing_hours(files, snaps, first_day, last_day):
    """Berlin hour buckets from the first day 00:00 to the morning after the last day that lack plan or change data."""
    start = datetime.combine(first_day, datetime.min.time())
    end = datetime.combine(last_day, datetime.min.time()) + COMPLETE_AFTER
    covered = set().union(*[plan_hours_of(f) for f in files]) if files else set()
    missing, h = set(), start
    while h < end:
        if h not in covered:
            missing.add(h)
        h += timedelta(hours=1)
    runs = fetch_runs(snaps)
    for a, b in zip(runs, runs[1:]):
        if b - a > MAX_SNAPSHOT_GAP:
            h = hour_floor(a)
            while h < b:
                if start <= h < end:
                    missing.add(h)
                h += timedelta(hours=1)
    if runs and runs[0] - RETENTION > start:  # the first change list does not reach back to the window start
        h = start
        while h < min(runs[0], end):
            missing.add(h)
            h += timedelta(hours=1)
    return missing


def complete_days(snaps, n):
    """The newest n service days with a change snapshot from the next morning on, oldest first."""
    if not snaps:
        return []
    newest = max(snaps)
    last = (newest - COMPLETE_AFTER).date()
    return [last - timedelta(days=i) for i in range(n - 1, -1, -1)]


# ---------------------------------------------------------------- stop table and runs (DuckDB)

def compute_runs(plan, fchg, days, missing):
    con = duckdb.connect()
    con.register("plan_raw", table(plan, PLAN_COLS, PLAN_TYPES))
    con.register("fchg_raw", table(fchg, FCHG_COLS, FCHG_TYPES))
    lo = datetime.combine(days[0], datetime.min.time())
    hi = datetime.combine(days[-1] + timedelta(days=1), datetime.min.time())
    # piebro's create_monthly_data_release.py, reduced to the columns needed here.
    con.execute("""
    create table stops as
    with p as (select distinct on (id) * from plan_raw order by id, snap desc),
    f as (
      select distinct on (id) * from fchg_raw
      where arr_ct is not null or dep_ct is not null or arr_clt is not null or dep_clt is not null
        or arr_ps = 'a' or dep_ps = 'a' or arr_cs is not null or dep_cs is not null or tl_t = 'e'
        or ref_type is not null or ref_number is not null or ref_label_type is not null or ref_owner is not null
        or ref_flags is not null
      order by id, snap desc)
    select coalesce(p.id, f.id) id,
      coalesce(p.station_name, f.station_name) station,
      coalesce(p.train_type, f.train_type) tt, coalesce(p.train_number, f.train_number) num,
      coalesce(p.arr_pt, f.arr_pt) arr_plan, coalesce(p.dep_pt, f.dep_pt) dep_plan,
      coalesce(f.arr_ct, p.arr_pt, f.arr_pt) arr_change, coalesce(f.dep_ct, p.dep_pt, f.dep_pt) dep_change,
      coalesce(f.arr_cs = 'c', f.arr_clt is not null) arr_canc,
      coalesce(f.dep_cs = 'c', f.dep_clt is not null) dep_canc,
      coalesce(f.arr_ps = 'a', false) or coalesce(f.dep_ps = 'a', false) additional,
      coalesce(f.tl_t = 'e', false) or f.ref_type is not null or f.ref_number is not null replacement,
      p.id is not null has_plan,
      regexp_extract(coalesce(p.id, f.id), '^(.*-\\d{10})-\\d+$', 1) ride,
      try_cast(split_part(coalesce(p.id, f.id), '-', -1) as integer) seq
    from p full outer join f on p.id = f.id
    """)
    in_scope = f"tt in ({', '.join(repr(t) for t in LONG_DISTANCE)}) and not replacement and ride <> ''"
    # Rows with no time at all (a stop only in the change data, without planned times) drop out of piebro's monthly
    # files; here they also mark the run: its plan is missing, so its first or last stop may be missing too.
    con.execute(f"""
    create table runs as
    select ride, any_value(tt) tt, any_value(num) num,
      min(coalesce(dep_plan, arr_plan)) filter (where has_time) start_plan,
      max(coalesce(arr_plan, dep_plan)) filter (where has_time) end_plan,
      bool_and(arr_canc or dep_canc) filter (where has_time) all_canc,
      bool_or(not has_plan and not additional) plan_missing,
      arg_min({{'station': station, 'delay': date_diff('minute', dep_plan, dep_change), 'canc': dep_canc}}, seq)
        filter (where has_time and dep_plan is not null) dep,
      arg_max({{'station': station, 'delay': date_diff('minute', arr_plan, arr_change), 'canc': arr_canc}}, seq)
        filter (where has_time and arr_plan is not null) arr
    from (select *, coalesce(dep_change, arr_change) is not null has_time from stops where {in_scope})
    group by ride
    having start_plan >= ? and start_plan < ?
    """, [lo, hi])
    out = []
    for r in con.execute("""select tt, num, start_plan, end_plan, all_canc, plan_missing, dep, arr from runs
                            order by tt, num, start_plan, ride""").fetchall():
        tt, num, start, end, all_canc, plan_missing, dep, arr = r
        out.append({"unit": f"{tt} {num}", "day": start.date(), "start": start, "end": end, "all_canc": bool(all_canc),
                    "gap": bool(plan_missing) or overlaps(missing, start, end), "dep": dep, "arr": arr})
    return out


def overlaps(missing, start, end):
    h, stop = hour_floor(start), (end or start) + GAP_TAIL
    while h <= stop:
        if h in missing:
            return True
        h += timedelta(hours=1)
    return False


def measured(ev, cancelled_key="canc"):
    """One end of a run: minutes, "x" when that stop was cancelled, None when not measured (no stop, out of range)."""
    if ev is None:
        return None
    if ev[cancelled_key]:
        return "x"
    d = ev["delay"]
    return d if d is not None and CLAMP_MIN <= d <= CLAMP_MAX else None


def build(runs, days, missing, as_of_snapshot):
    """The data/last7.json document."""
    by_unit = {}
    for r in runs:
        by_unit.setdefault(r["unit"], []).append(r)
    stations, index = [], {}

    def sidx(name):
        if name not in index:
            index[name] = len(stations)
            stations.append(name)
        return index[name]

    trains, doubles = {}, 0
    day_pos = {d: i for i, d in enumerate(days)}
    for unit in sorted(by_unit, key=lambda u: (u.split(" ")[0], len(u), u)):
        rs = by_unit[unit]
        # The usual first and last German stop over the week: what the marks normally refer to.
        o = Counter(r["dep"]["station"] for r in rs if r["dep"] and r["dep"]["station"]).most_common(1)
        d = Counter(r["arr"]["station"] for r in rs if r["arr"] and r["arr"]["station"]).most_common(1)
        o, d = (o[0][0] if o else None), (d[0][0] if d else None)
        cells = [None] * len(days)
        for r in rs:
            i = day_pos[r["day"]]
            if cells[i] is not None:
                doubles += 1  # a number used twice on one day: keep the earlier run
                continue
            if r["gap"]:
                cells[i] = "?"
            elif r["all_canc"]:
                cells[i] = "x"
            else:
                cell = [measured(r["dep"]), measured(r["arr"])]
                ro = r["dep"]["station"] if r["dep"] else None
                rd = r["arr"]["station"] if r["arr"] else None
                if (ro and ro != o) or (rd and rd != d):
                    cell += [sidx(ro) if ro else None, sidx(rd) if rd else None]
                cells[i] = cell
        trains[unit] = [sidx(o) if o else None, sidx(d) if d else None, cells]
    if doubles:
        log(f"{doubles} train numbers ran twice on one day; the earlier run is kept")
    gaps = {}
    for h in sorted(missing):
        if days[0] <= h.date() <= days[-1]:
            gaps.setdefault(h.date().isoformat(), []).append(h.hour)
    return {
        "source": "piebro/deutsche-bahn-data raw_data (Deutsche Bahn Timetables API, CC BY 4.0)",
        "asOf": days[-1].isoformat(),
        "dataTo": as_of_snapshot.strftime("%Y-%m-%dT%H:%M"),
        "days": [d.isoformat() for d in days],
        "gaps": gaps,
        "stations": stations,
        "trains": trains,
    }


def encode(doc):
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n"


# ---------------------------------------------------------------- sanity checks (workflow gate)

def check(path, previous=None, min_trains=600, min_day_runs=300, max_bytes=400_000):
    """Exit non-zero unless the file is a plausible last-7-days document. Prints a one-line summary."""
    raw = Path(path).read_bytes()
    doc = json.loads(raw)
    problems = []
    days = [date.fromisoformat(d) for d in doc["days"]]
    if len(days) != DAYS or any(b - a != timedelta(days=1) for a, b in zip(days, days[1:])):
        problems.append(f"days are not {DAYS} consecutive dates: {doc['days']}")
    if doc["asOf"] != doc["days"][-1]:
        problems.append("asOf is not the last day")
    if (date.today() - days[-1]).days > 4:
        problems.append(f"asOf {doc['asOf']} is more than 4 days old")
    n = len(doc["trains"])
    if n < min_trains:
        problems.append(f"only {n} trains (need {min_trains})")
    per_day = [sum(1 for t in doc["trains"].values() if t[2][i] not in (None, "?")) for i in range(len(days))]
    good_days = sum(1 for c in per_day if c >= min_day_runs)
    if good_days < 5:
        problems.append(f"only {good_days} days with {min_day_runs}+ measured runs: {per_day}")
    if len(raw) > max_bytes:
        problems.append(f"file is {len(raw)} bytes (limit {max_bytes})")
    for unit, (o, d, cells) in doc["trains"].items():
        if len(cells) != len(days) or not re.match(r"^[A-Z]+ \S+$", unit):
            problems.append(f"bad record {unit}")
            break
    if previous and Path(previous).exists():
        try:
            old = json.loads(Path(previous).read_text(encoding="utf-8"))
            if old.get("asOf") and old["asOf"] > doc["asOf"]:
                problems.append(f"asOf went back from {old['asOf']} to {doc['asOf']}")
        except ValueError:
            pass
    print(f"last7: asOf {doc['asOf']}, {n} trains, measured runs per day {per_day}, {len(raw)} bytes")
    for p in problems:
        print(f"PROBLEM: {p}")
    return 1 if problems else 0


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data-dir", help="local raw_data tree instead of downloading")
    ap.add_argument("--cache", help="download folder (default: a temporary folder, removed afterwards)")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data" / "last7.json"))
    ap.add_argument("--names", help="eva -> station name JSON (default: piebro's config/eva_to_station_name.json)")
    ap.add_argument("--snapshot-tz", default="UTC", help="time zone of the raw files' fetch timestamps (piebro's runner clock: UTC)")
    ap.add_argument("--today", help="UTC date to list folders back from (default: today)")
    ap.add_argument("--check", metavar="FILE", help="only run the sanity checks on FILE")
    ap.add_argument("--previous", help="with --check: the committed file, so asOf never goes back")
    args = ap.parse_args()
    if args.check:
        sys.exit(check(args.check, args.previous))

    snapshot_tz = timezone.utc if args.snapshot_tz.upper() == "UTC" else ZoneInfo(args.snapshot_tz)
    names = load_names(args.names)
    tmp = None
    if args.data_dir:
        files = local_files(args.data_dir)
    else:
        today = date.fromisoformat(args.today) if args.today else datetime.now(timezone.utc).date()
        # Service days D-7..D need fetch folders D-8..D+1 (piebro files by UTC fetch day); newest complete day is
        # yesterday at best.
        folders = [today - timedelta(days=i) for i in range(DAYS + 2, -1, -1)]
        listing = list_remote(folders)
        total = sum(s for _, s in listing)
        log(f"raw files: {len(listing)} in {len(folders)} day folders, {total / 1e9:.2f} GB")
        cache = Path(args.cache) if args.cache else Path(tmp := tempfile.mkdtemp(prefix="gp-raw-"))
        files = [download(rel, size, cache) for rel, size in listing]
    files.sort(key=lambda p: (folder_day(p), p.name))
    if not files:
        sys.exit("no raw files")
    try:
        plan, fchg, snaps = extract(files, names, snapshot_tz)
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)
    days = complete_days(snaps, DAYS)
    if not days:
        sys.exit("no change snapshots in the raw files")
    missing = missing_hours(files, snaps, days[0], days[-1])
    log(f"days {days[0]}..{days[-1]} (newest snapshot {max(snaps):%Y-%m-%d %H:%M} Berlin); "
        f"{len(missing)} hours with missing plan or change data; fetch runs at "
        + ", ".join(f"{r:%d %H:%M}" for r in fetch_runs(snaps)))
    runs = compute_runs(plan, fchg, days, missing)
    doc = build(runs, days, missing, max(snaps))
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    text = encode(doc)
    out.write_text(text, encoding="utf-8")
    log(f"wrote {out}: {len(doc['trains'])} trains, {len(runs)} runs, {len(text.encode()) / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
