# German Punctuality

A mobile-first static site that ranks Deutsche Bahn's most delayed long-distance trains over the last
~12 months. Your connection is not guaranteed.

The repo is called `db-delay-leaderboard`. The site is branded **German Punctuality** and is meant to live
at `germanpunctuality.com`.

- Leaderboard of the top 10 trains by average minutes late, and by average delay as a share of the scheduled journey (toggle).
- Lazy-loaded MapLibre map (OpenFreeMap Positron) with the top trains' routes and station hotspots.
- Monthly chart, fun extras, methodology and FAQ.
- A page per ranked train (`/train/<slug>/`) with a delay histogram, a monthly chart, the route and a share button.
- Generated Open Graph images for the home page and for every train, versioned by the data's last month.

## How the data is computed

`scripts/compute.py` (Python + DuckDB) reads the monthly Parquet files of
[piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data) and writes `data/stats.json`,
`data/monthly.json` and `data/trains/<slug>.json`. The site is built from those committed files, so a build never
needs the raw data. Every number on the site comes from them.

- **Window.** The latest 12 published months, keeping only months with full station coverage (at least 1000 distinct stations). A partial month is skipped and reported on the site.
- **Scope.** Train types ICE, IC, EC, ECE, RJ, RJX, NJ, EN, FLX, TGV and WB, without replacement trains.
- **Run.** One train number on one scheduled day. Its month is the month of its scheduled first departure.
- **Delay.** Arrival delay in minutes at the run's last non-cancelled stop with a scheduled arrival. For international trains that is the last German stop.
- **Clamp.** Runs with a final delay below −10 or above 600 minutes are dropped from the delay statistics (the count is in the JSON and on the site). This nudges the monthly averages about 0.2–0.4 min above the raw, unclamped figures.
- **Relative delay.** `100 * delay / scheduled journey minutes`, where the journey runs from the run's first scheduled departure to its scheduled arrival at the measured stop. Runs scheduled for under 15 minutes are left out of the % statistics only.
- **Ranking pool.** Trains with at least 100 measured runs (and, for the % ranking, 100 runs that count for the % statistics).
- **Same train, several numbers.** Train numbers with the same route and the same planned start times for every run are one physical train. They are merged under the shortest number and shown as "also runs as".
- **Extras.** Best-behaved train (lowest average delay, under 5% fully cancelled), most cancelled, worst train-month, worst single run (origin differs from destination, at least 3 stops).

Check the output against the research numbers:

```bash
python scripts/check_reference.py
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
.venv/bin/python scripts/compute.py                      # reads Hugging Face over HTTP
.venv/bin/python scripts/compute.py --data-dir ~/dbdata \
    --stations-csv ~/dbdata/trainline-stations.csv       # reads local data-YYYY-MM.parquet files
```

Review screenshots (needs `npx playwright install chromium` once, and a build):

```bash
node scripts/screenshots.mjs shots nj-40490
```

## Refresh workflow

`.github/workflows/refresh.yml` runs weekly and on demand. It asks Hugging Face which monthly files are
published, and only when the window changed (or when run manually) recomputes the data and commits
`data/*.json` if the content changed. It needs no secrets. A push to `main` triggers a Vercel redeploy,
which regenerates the OG images.

## Deploy on Vercel

Import the repository with default settings (framework preset Next.js, `output: 'export'`). There is no
server and no environment variable is required. `npm run build` regenerates the OG PNGs, then Next writes
the static site.

## Switching domains

The site URL lives in one place, `lib/site.ts`, and is read from `NEXT_PUBLIC_SITE_URL` (default
`https://db-delay-leaderboard.vercel.app`). Canonical URLs, Open Graph and Twitter image URLs, the sitemap and
`robots.txt` all derive from it.

To move to `germanpunctuality.com`: add the domain to the Vercel project, set
`NEXT_PUBLIC_SITE_URL=https://germanpunctuality.com` in Project Settings → Environment Variables, and
redeploy. The variable is inlined at build time, so a redeploy is required.

## Attribution

- Data: Deutsche Bahn via [piebro/deutsche-bahn-data](https://github.com/piebro/deutsche-bahn-data), CC BY 4.0.
- Station coordinates: [Trainline stations](https://github.com/trainline-eu/stations) (ODbL).
- Map: [OpenFreeMap](https://openfreemap.org), © [OpenMapTiles](https://openmaptiles.org), data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- Fonts: Barlow, Barlow Condensed and Roboto Mono (SIL OFL, licences in `scripts/fonts/`).

Not affiliated with Deutsche Bahn.
