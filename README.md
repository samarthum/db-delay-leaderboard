# German Punctuality

> Picking this up? Read [docs/STATUS.md](docs/STATUS.md) (live features, build, tests, env), [docs/ROADMAP.md](docs/ROADMAP.md) and [docs/RULES.md](docs/RULES.md).

A mobile-first static site that shows how late Deutsche Bahn trains are and ranks the most delayed
long-distance trains and regional lines over the last ~12 months.

The repo is called `db-delay-leaderboard`. The site is branded **German Punctuality** and is meant to live
at `germanpunctuality.com`.

- A headline from the last three months: the average delay of a long-distance and a regional trip, and how the trips split by lateness.
- A monthly chart, with a long-distance/regional switch.
- Two rankings, long-distance trains and regional lines, each by average minutes late or by delay as a share of the planned trip (toggles).
- A static station map: one dot per station, coloured by average arrival delay, with the latest big stations listed.
- A page per ranked train (`/train/<slug>/`) and line (`/line/<slug>/`) with a delay histogram, a monthly chart, the route and a share button.
- Generated Open Graph images for the home page and every train and line, versioned by the data's last month.

## How the data is computed

`scripts/compute.py` (Python + DuckDB) downloads the monthly Parquet files of
[piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data) and writes `data/stats.json`,
`data/monthly.json`, `data/stations.json`, `data/trains/<slug>.json` and `data/lines/<slug>.json`. The site is
built from those committed files, so a build never needs the raw data. Every number on the site comes from them.

- **Window.** The latest 12 published months, keeping only months with full station coverage (at least 1000 distinct stations). A partial month is skipped and reported on the site.
- **Scope.** Long-distance train types ICE, IC, EC, ECE, RJ, RJX, FLX, TGV and WB. Regional trains on lines whose code starts with RE, RB, IRE, MEX, RS or FEX. Night trains (NJ, EN), S-Bahn, buses and replacement trains are left out.
- **Run.** One train number on one scheduled day. Its month is the month of its scheduled first departure.
- **Delay.** Arrival delay in minutes at the run's last non-cancelled stop with a scheduled arrival. For international trains that is the last German stop.
- **Clamp.** Runs with a final delay below −10 or above 600 minutes are dropped from the delay statistics (the count is in the JSON and on the site).
- **Relative delay.** `100 * delay / scheduled journey minutes`, where the journey runs from the run's first scheduled departure to its scheduled arrival at the measured stop. Runs scheduled for under 15 minutes are left out of the % statistics only.
- **Units.** Long-distance trains are ranked per train number, regional trains per line. A line is its code (`RE 19`) plus the connected set of stations its runs serve, because the same code is reused in different regions. A line counts its trips in both directions.
- **Ranking pool.** Trains with at least 100 measured runs, lines with at least 1000 (and, for the % rankings, as many runs that count for %).
- **Same train, several numbers.** Train numbers with the same route and the same planned start times for every run are one physical train. They are merged under the shortest number and shown as "also runs as".
- **Headline.** The averages and lateness bands of every run in the last three window months, per category.
- **Stations.** Average arrival delay per station over the window, for stations with at least 500 measured arrivals.

Check the headline against an independent query (needs the Parquet files locally):

```bash
python scripts/check_headline.py --data-dir ~/dbdata
```

## Run it locally

Requires Node 20.9+ (Node 20 or 22) and, to recompute data, Python 3.12.

```bash
npm ci
npm run dev          # http://localhost:3000
npm run build        # OG images (prebuild), then a static export into out/
npx serve out        # or: python3 -m http.server --directory out
```

Recompute the data:

```bash
python -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/compute.py                      # downloads ~4 GB into /tmp/db-delay-parquet first
.venv/bin/python scripts/compute.py --data-dir ~/dbdata \
    --stations-csv ~/dbdata/trainline-stations.csv       # reads local data-YYYY-MM.parquet files
```

Review screenshots (needs `npx playwright install chromium` once, and a build):

```bash
node scripts/screenshots.mjs shots            # optional: [trainSlug] [lineSlug]
```

## Refresh workflow

`.github/workflows/monthly.yml` checks daily from the 2nd to the 10th of each month (and on demand) whether the last
finished month is published on Hugging Face and not yet in `data/stats.json`. Only then it downloads the window's
monthly files, runs the whole pipeline (`scripts/monthly.py run`: compute, stops, routes, connections, compensation),
re-checks every file family against the Parquet with independent queries (`tests/data/verify_monthly.py`), runs a
sanity gate and commits the data files to `main`. On pull requests that change the pipeline it is a dry run. It needs
no secrets. A push to `main` triggers a Vercel redeploy, which regenerates the OG images. `.github/workflows/last7.yml`
refreshes "the last 7 days" daily the same way. Details: `docs/notes/data-pipeline.md`.

## Deploy on Vercel

Import the repository with default settings (framework preset Next.js, `output: 'export'`). There is no
server and no environment variable is required. `npm run build` regenerates the OG PNGs, then Next writes
the static site.

## Switching domains

The site URL lives in one place, `lib/site.ts`, and is read from `NEXT_PUBLIC_SITE_URL` (default
`https://german-punctuality.vercel.app`). Canonical URLs, Open Graph and Twitter image URLs, the sitemap and
`robots.txt` all derive from it.

To move to `germanpunctuality.com`: add the domain to the Vercel project, set
`NEXT_PUBLIC_SITE_URL=https://germanpunctuality.com` in Project Settings → Environment Variables, and
redeploy. The variable is inlined at build time, so a redeploy is required.

## Attribution

- Data: Deutsche Bahn via [piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data), CC BY 4.0
  (monthly files for the history, the raw API answers for the last 7 days; station names from that project's
  `config/eva_to_station_name.json`, MIT).
- Live status: Deutsche Bahn AG, Timetables API, CC BY 4.0. Abroad: [Transitous](https://transitous.org/sources/)
  (open data of each country's railways, OpenStreetMap ODbL), used under its non-commercial, open-source usage policy.
- Stops abroad of cross-border trains: [Transitous](https://transitous.org/sources/) timetables (same policy).
- History at stops abroad: Netherlands [Rijden de Treinen](https://www.rijdendetreinen.nl/en/open-data) train
  archive, CC BY 4.0; Belgium [Infrabel](https://opendata.infrabel.be/explore/dataset/stiptheid-gegevens-maandelijksebestanden/)
  monthly raw punctuality files, CC0.
- Station coordinates: [Trainline stations](https://github.com/trainline-eu/stations) (ODbL).
- Map outline: [Natural Earth](https://www.naturalearthdata.com) (public domain), simplified by `scripts/germany_outline.py`.
- Fonts: Barlow, Barlow Condensed and Roboto Mono (SIL OFL, licences in `scripts/fonts/`).

Not affiliated with Deutsche Bahn.

## Licence

Code: MIT (see `LICENSE`). The data files in `data/` are derived from the sources under Attribution and keep
their licences: train data CC BY 4.0 / ODbL, DB Timetables API CC BY 4.0, Transitous (see https://transitous.org/sources/),
`data/abroad-history.json` CC BY 4.0 (Rijden de Treinen) and CC0 (Infrabel).
