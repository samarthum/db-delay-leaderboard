"""Station ids (EVA) for every first recorded stop of a train that arrives there (it comes from abroad or from a stop
the data does not have), from the raw Parquet: the id most rows use for that name.

  ~/gp-search/venv-dir/v/bin/python scripts/border_stations.py --data-dir ~/gp-search/parquet

Writes data/border-stations.json { "Emmerich": "8001773", ... } for scripts/foreign_origins.mjs and the live API.
"""
import argparse, glob, json, os

import duckdb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out", default="data/border-stations.json")
    a = ap.parse_args()
    stops = json.load(open("data/stops.json"))
    names = sorted({stops["stations"][t[2][0][0]] for t in stops["trains"] if t[2][0][2] is not None and t[2][0][3] >= 20})
    files = sorted(glob.glob(os.path.join(a.data_dir, "data-*.parquet")))[-2:]
    con = duckdb.connect()
    con.execute("set memory_limit='1000MB'")
    con.execute("create table n(name varchar)")
    con.executemany("insert into n values (?)", [(x,) for x in names])
    src = ", ".join(f"'{f}'" for f in files)
    rows = con.execute(f"""select station_name, mode(ltrim(eva, '0')) from read_parquet([{src}])
                           where station_name in (select name from n) group by 1""").fetchall()
    out = {k: v for k, v in rows}
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=0, sort_keys=True)
    print(f"border stations: {len(out)} of {len(names)} names -> {a.out}")


if __name__ == "__main__":
    main()
