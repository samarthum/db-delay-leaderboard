"""Map the stations that have route pages to the station names and EVA numbers of DB's Timetables API.

Writes data/live-stations.json: { "<site station name>": { "eva": "8000207", "name": "<API name>" } }.
The API name is what the API itself prints in a train's path ("ppth"), so the live board can tell which trains
continue to the destination. Needs DB_CLIENT_ID / DB_API_KEY in the environment, or in the file named by DB_ENV_FILE (default .env.local)
(DB_CLIENT_ID, DB_API_KEY). Calls are spaced to stay far under the Free plan's 60 per minute.

Run:  python3 scripts/live_stations.py          (about 5 minutes; writes only if every station resolves)
"""
import os
import datetime
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV = Path(os.environ.get("DB_ENV_FILE") or Path(__file__).resolve().parent.parent / ".env.local")
BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1"
LONG = {"ICE", "IC", "EC", "ECE", "RJ", "RJX", "TGV", "FLX"}

# Site name -> the search pattern DB's own spelling needs ("Münster(Westf)Hbf"). A plain "Frankfurt Hbf" finds the S-Bahn
# level, which has no long-distance trains.
PATTERN = {
    "Frankfurt Hbf": "Frankfurt(Main)Hbf",
    "Frankfurt Flughafen": "Frankfurt(M) Flughafen Fernbf",
    "Freiburg Hbf": "Freiburg(Breisgau) Hbf",
    "Halle Hbf": "Halle(Saale)Hbf",
    "Hamm Hbf": "Hamm(Westf)Hbf",
    "Köln Messe/Deutz": "Köln Messe",
    "Minden": "Minden(Westf)",
    "Münster Hbf": "Münster(Westf)Hbf",
    "Siegburg/Bonn": "Siegburg",
    "Singen (Hohentwiel)": "Singen(Hohentwiel)",
}

env = {}
for line in ENV.read_text().splitlines():
    m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
    if m:
        env[m.group(1)] = m.group(2).strip("\"'")
HEAD = {"DB-Client-Id": env["DB_CLIENT_ID"], "DB-Api-Key": env["DB_API_KEY"], "Accept": "application/xml",
        "User-Agent": "zugmonitor.de"}


def get(path: str) -> ET.Element:
    time.sleep(1.1)
    req = urllib.request.Request(BASE + path, headers=HEAD)
    return ET.fromstring(urllib.request.urlopen(req, timeout=30).read())


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss"))


def long_trains(eva: str) -> int:
    """Long-distance departures planned at this station over two hours starting next hour (a station with none is the wrong EVA)."""
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=1)))
    n = 0
    for h in range(1, 3):
        t = now + datetime.timedelta(hours=h)
        for s in get(f"/plan/{eva}/{t:%y%m%d}/{t:%H}").findall("s"):
            tl = s.find("tl")
            if tl is not None and tl.get("c") in LONG and s.find("dp") is not None:
                n += 1
    return n


def main() -> int:
    routes = json.loads((ROOT / "data/routes.json").read_text())["routes"]
    names = sorted({x for r in routes for x in (r["from"], r["to"])})
    out, problems = {}, []
    for name in names:
        try:
            cands = [(s.get("name") or "", s.get("eva") or "") for s in get("/station/" + urllib.parse.quote(PATTERN.get(name, name))).findall("station")]
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
            cands = []
        exact = [c for c in cands if norm(c[0]) in (norm(PATTERN.get(name, name)), norm(name))]
        pick = exact[0] if len(exact) == 1 else None
        if pick is None:
            problems.append((name, cands[:6]))
            print("AMBIGUOUS", name, cands[:6])
            continue
        out[name] = {"eva": pick[1], "name": pick[0]}
        print("ok", name, "->", pick)
    if problems:
        print(len(problems), "stations need a decision; nothing written")
        (ROOT / "data/live-stations.todo.json").write_text(json.dumps(problems, ensure_ascii=False, indent=1))
        return 1
    # sanity: every station must show long-distance departures sometime in the next two hours (night: some may not)
    quiet = []
    for name, v in out.items():
        n = long_trains(v["eva"])
        v["_n6h"] = n
        if n == 0:
            quiet.append(name)
    print("stations with no long-distance departure in the next two hours:", quiet)
    for v in out.values():
        v.pop("_n6h", None)
    (ROOT / "data/live-stations.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print("wrote", len(out), "stations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
