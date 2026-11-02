"""Diagnostic (PR runs of .github/workflows/abroad.yml): what the sources for stops and delays abroad look like.

Prints file layouts, a sample through train and the licence pages. Network only; writes nothing to the repo.

  python tests/data/probe_abroad.py --part gtfs|transitous|rdt|be|ch|at|other
"""
import argparse
import csv
import gzip
import io
import json
import re
import sys
import time
import urllib.request
import zipfile

UA = "german-punctuality/1.0 (+https://german-punctuality.vercel.app)"


def get(url, n=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(n) if n else r.read()
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read()[:2000]
    except Exception as e:  # noqa: BLE001
        return None, {}, str(e).encode()


def show(label, url, n=4000):
    st, h, b = get(url, n)
    print(f"\n=== {label}: {url} -> {st} {h.get('Content-Type')} len={h.get('Content-Length')}")
    print(b[:n].decode("utf-8", "replace"))


def gtfs():
    st, h, b = get("https://download.gtfs.de/germany/fv_free/latest.zip", timeout=300)
    print("fv_free", st, len(b))
    z = zipfile.ZipFile(io.BytesIO(b))
    for i in z.infolist():
        print(f"  {i.filename} {i.file_size}")
    for name in z.namelist():
        with z.open(name) as f:
            head = [next(f, b"").decode("utf-8-sig", "replace").rstrip() for _ in range(4)]
        print(f"--- {name}\n" + "\n".join(head))
    rd = lambda n: list(csv.DictReader(io.TextIOWrapper(z.open(n), "utf-8-sig")))  # noqa: E731
    stops = {s["stop_id"]: s for s in rd("stops.txt")}
    routes = {r["route_id"]: r for r in rd("routes.txt")}
    trips = {t["trip_id"]: t for t in rd("trips.txt")}
    print("stops", len(stops), "routes", len(routes), "trips", len(trips))
    print("route_short_name sample", sorted({r.get("route_short_name") for r in routes.values()})[:80])
    st_by = {}
    for r in csv.DictReader(io.TextIOWrapper(z.open("stop_times.txt"), "utf-8-sig")):
        st_by.setdefault(r["trip_id"], []).append(r)
    shown = 0
    for tid, rows in st_by.items():
        names = [stops[r["stop_id"]]["stop_name"] for r in sorted(rows, key=lambda r: int(r["stop_sequence"]))]
        if any("Amsterdam" in n for n in names) or (shown < 6 and any(k in " ".join(names) for k in ("Wien", "Basel", "Praha", "Bruxelles", "Brussel"))):
            t = trips[tid]
            print("\nTRIP", tid, json.dumps(t, ensure_ascii=False), json.dumps(routes[t["route_id"]], ensure_ascii=False))
            for r in sorted(rows, key=lambda r: int(r["stop_sequence"])):
                s = stops[r["stop_id"]]
                print("   ", r["stop_sequence"], r["arrival_time"], r["departure_time"], s["stop_name"], s.get("stop_lat"), s.get("stop_lon"), r["stop_id"], s.get("parent_station"))
            shown += 1
            if shown > 9:
                break
    try:
        cal = rd("calendar.txt")
        print("calendar", len(cal), cal[:2])
    except KeyError:
        pass


def transitous():
    api = "https://api.transitous.org/api"
    show("geocode", f"{api}/v1/geocode?type=STOP&text=Utrecht%20Centraal", 1500)
    st, h, b = get(f"{api}/v1/geocode?type=STOP&text=Amsterdam%20Centraal")
    hits = json.loads(b)
    print(json.dumps(hits[:3], ensure_ascii=False)[:1500])
    sid = next(x["id"] for x in hits if x.get("type") == "STOP")
    time.sleep(1.5)
    st, h, b = get(f"{api}/v6/stoptimes?stopId={urllib.parse.quote(sid)}&n=200&window=86400&mode=HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL")
    j = json.loads(b)
    ices = [s for s in j.get("stopTimes", []) if "ICE" in (s.get("displayName") or "") + (s.get("routeShortName") or "") + (s.get("tripShortName") or "")]
    print("stoptimes", st, len(j.get("stopTimes", [])), "ICE", len(ices))
    if ices:
        print(json.dumps(ices[0], ensure_ascii=False)[:2500])
        time.sleep(1.5)
        st, h, b = get(f"{api}/v5/trip?tripId={urllib.parse.quote(ices[0]['tripId'])}")
        print("trip v5", st, b[:300])
        time.sleep(1.5)
        st, h, b = get(f"{api}/v6/trip?tripId={urllib.parse.quote(ices[0]['tripId'])}")
        print("trip v6", st)
        try:
            tj = json.loads(b)
            leg = tj["legs"][0]
            print(json.dumps({k: v for k, v in leg.items() if k not in ("legGeometry", "intermediateStops")}, ensure_ascii=False)[:1500])
            for s in leg.get("intermediateStops", []):
                print("   ", s.get("name"), s.get("stopId"), s.get("scheduledArrival"), s.get("arrival"), s.get("scheduledDeparture"), s.get("departure"))
        except Exception as e:  # noqa: BLE001
            print("trip parse", e, b[:500])
    time.sleep(1.5)
    show("arrivals", f"{api}/v6/stoptimes?stopId={urllib.parse.quote(sid)}&n=5&arriveBy=true&mode=HIGHSPEED_RAIL,LONG_DISTANCE", 2500)


def rdt():
    show("services list", "https://opendata.rijdendetreinen.nl/public/services/", 6000)
    show("stations list", "https://opendata.rijdendetreinen.nl/public/stations/", 2000)
    show("licence", "https://www.rijdendetreinen.nl/en/open-data", 3000)
    show("licence services", "https://www.rijdendetreinen.nl/en/open-data/train-archive", 6000)
    for m in ("2025-11", "2026-09", "2026-10"):
        st, h, b = get(f"https://opendata.rijdendetreinen.nl/public/services/services-{m}.csv.gz", timeout=600)
        print(f"\nservices-{m}: {st} {len(b)} bytes")
        if st != 200:
            continue
        rows = csv.reader(io.TextIOWrapper(gzip.GzipFile(fileobj=io.BytesIO(b)), "utf-8"))
        head = next(rows)
        print(head)
        types, intl, shown = {}, {}, 0
        for r in rows:
            d = dict(zip(head, r))
            ty = d.get("Service:Type")
            types[ty] = types.get(ty, 0) + 1
            if ty and ("ICE" in ty or "International" in ty or "Eurocity" in ty or "Nightjet" in ty or "Eurostar" in ty):
                intl.setdefault(ty, set()).add(d.get("Service:Train number"))
                if shown < 40 and d.get("Service:Train number") in ("121", "221", "140", "141", "105"):
                    print("  ", r)
                    shown += 1
        print("types", sorted(types.items(), key=lambda x: -x[1])[:40])
        print("international numbers", {k: sorted(v, key=lambda x: int(x) if x.isdigit() else 0)[:80] for k, v in intl.items()})
        break
    st, h, b = get("https://opendata.rijdendetreinen.nl/public/stations/stations-2023-09.csv")
    print("stations", st, b[:1500].decode("utf-8", "replace"))


def be():
    base = "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets"
    for q in ("stiptheid", "punctuality", "ponctualite"):
        st, h, b = get(f"{base}?where=search(%22{q}%22)&limit=20&lang=en")
        print("\ninfrabel", q, st)
        try:
            for d in json.loads(b).get("results", []):
                m = d.get("metas", {}).get("default", {})
                print("  ", d.get("dataset_id"), "|", m.get("title"), "|", m.get("license"), "|", m.get("records_count"), "|", m.get("modified"))
        except Exception as e:  # noqa: BLE001
            print(e, b[:500])
    show("raw D-1 sample", "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/ruwe-gegevens-van-stiptheid-d-1/records?limit=3&where=train_no%3D10", 4000)
    show("raw D-1 schema", "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/ruwe-gegevens-van-stiptheid-d-1", 4000)
    show("monthly raw (attachments)", "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets/ruwe-gegevens-van-stiptheid-d-1/attachments", 4000)


def ch():
    show("ist-daten archive page", "https://archive.opentransportdata.swiss/istdaten/", 3000)
    for u in ("https://archive.opentransportdata.swiss/istdaten/2025/ist-daten-2025-11.zip",
              "https://archive.opentransportdata.swiss/istdaten/2026/ist-daten-2026-09.zip"):
        req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print("HEAD", u, r.status, r.headers.get("Content-Length"), r.headers.get("Content-Type"))
        except Exception as e:  # noqa: BLE001
            print("HEAD", u, e)
    show("CKAN istdaten", "https://data.opentransportdata.swiss/api/3/action/package_show?id=istdaten", 5000)
    show("terms", "https://opentransportdata.swiss/en/terms-of-use/", 3000)


def at():
    show("mobilitaetsdaten CKAN", "https://www.mobilitaetsdaten.gv.at/api/3/action/package_search?q=Zug&rows=20", 6000)
    show("data.gv.at OEBB Puenktlichkeit", "https://www.data.gv.at/katalog/api/3/action/package_search?q=P%C3%BCnktlichkeit&rows=10", 5000)


def text_around(url, words, width=300, n=8):
    st, h, b = get(url)
    t = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", b.decode("utf-8", "replace"))
    hrefs = re.findall(r'href="([^"]+)"', t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t)
    print(f"\n=== {url} -> {st}")
    k = 0
    for w in words:
        for m in re.finditer(w, t, re.I):
            print("  ..." + t[max(0, m.start() - width): m.end() + width] + "...")
            k += 1
            if k >= n:
                return hrefs
    return hrefs


def round2():
    text_around("https://www.rijdendetreinen.nl/en/open-data/train-archive", ["licen", "CC BY", "Creative"])
    text_around("https://www.rijdendetreinen.nl/en/open-data", ["licen", "CC BY", "Creative", "attribut"])
    base = "https://opendata.infrabel.be/api/explore/v2.1/catalog/datasets"
    st, h, b = get(f"{base}/ruwe-gegevens-van-stiptheid-d-1")
    try:
        m = json.loads(b)["metas"]["default"]
        print("INFRABEL D-1 description:", re.sub(r"<[^>]+>", " ", m.get("description") or "")[:3000])
    except Exception as e:  # noqa: BLE001
        print(e)
    for q in ("ruwe", "raw", "brute", "maand"):
        st, h, b = get(f"{base}?where=search(%22{q}%22)&limit=30&lang=en&select=dataset_id")
        try:
            print("infrabel", q, [d["dataset_id"] for d in json.loads(b)["results"]])
        except Exception as e:  # noqa: BLE001
            print(q, e)
    hrefs = text_around("https://opendata.infrabel.be/explore/dataset/ruwe-gegevens-van-stiptheid-d-1/information/", ["maand", "month", "archive", "archief", "previous"])
    print([x for x in hrefs if "csv" in x.lower() or "zip" in x.lower() or "blob" in x.lower()][:30])
    for u in ("https://archive.opentransportdata.swiss/istdaten/2025/ist-daten-2025-11.zip",
              "https://archive.opentransportdata.swiss/istdaten/2026/ist-daten-2026-09.zip",
              "https://archive.opentransportdata.swiss/istdaten/"):
        st, h, b = get(u, 300)
        print("CH", u, st, h.get("Content-Length"), h.get("Content-Type"), b[:200])
    hrefs = text_around("https://opentransportdata.swiss/en/ist-daten-archiv/", ["archive", "Archiv", "zip"])
    print("CH links", [x for x in hrefs if "zip" in x or "archive" in x][:40])
    hrefs = text_around("https://opentransportdata.swiss/de/ist-daten-archiv/", ["Archiv", "zip"])
    print("CH links de", [x for x in hrefs if "zip" in x or "archive" in x][:40])
    st, h, b = get("https://data.opentransportdata.swiss/api/3/action/package_search?q=istdaten&rows=5")
    print("CKAN", st, b[:1500])
    text_around("https://opentransportdata.swiss/en/terms-of-use/", ["attribution", "source", "free of charge"], 250, 6)
    for u in ("https://www.mobilitaetsdaten.gv.at/", "https://www.mobilitaetsdaten.gv.at/de/datensaetze",
              "https://data.oebb.at/de/datensaetze", "https://www.data.gv.at/suche/?searchterm=P%C3%BCnktlichkeit"):
        hrefs = text_around(u, ["Pünktlich", "Verspät", "Ist-Daten", "Zugfahrt", "Echtzeit"], 200, 6)
    api = "https://api.transitous.org/api"
    st, h, b = get(f"{api}/v1/reverse-geocode?place=52.0898,5.1098&type=STOP")
    print("reverse", st, b[:600])
    time.sleep(1.5)
    st, h, b = get(f"{api}/v1/geocode?type=STOP&text=Emmerich")
    hits = json.loads(b)
    print([(x["name"], x["id"], x.get("modes")) for x in hits[:5]])
    sid = next(x["id"] for x in hits if "LONG_DISTANCE" in (x.get("modes") or []) or "HIGHSPEED_RAIL" in (x.get("modes") or []))
    time.sleep(1.5)
    st, h, b = get(f"{api}/v6/stoptimes?stopId={urllib.parse.quote(sid)}&n=500&window=86400&mode=HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL")
    j = json.loads(b)
    print("Emmerich board", st, len(j.get("stopTimes", [])), sorted({(s.get("displayName"), s.get("tripShortName"), s.get("source", "")[:12]) for s in j.get("stopTimes", [])})[:60])


def other():
    show("CZ data.gov.cz", "https://data.gov.cz/api/v2/datasets?query=zpo%C5%BEd%C4%9Bn%C3%AD%20vlak%C5%AF", 3000)
    show("FR SNCF regularite", "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets?where=search(%22regularite%22)&limit=20", 4000)
    show("DK", "https://www.opendata.dk/api/3/action/package_search?q=tog%20forsinkelse", 2000)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", required=True)
    part = ap.parse_args().part
    import urllib.parse  # noqa: E402,F401
    {"gtfs": gtfs, "transitous": transitous, "rdt": rdt, "be": be, "ch": ch, "at": at, "other": other, "round2": round2}[part]()
    sys.stdout.flush()
