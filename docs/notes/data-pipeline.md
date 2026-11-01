<!-- Working notes carried over from the agent's project notes; paths point into this repo. -->
# Data pipeline: Parquet -> stats, stops, routes

Source: monthly Parquet in `$GP_PARQUET` (piebro/deutsche-bahn-data, CC BY 4.0), window set by `data/stats.json`. DuckDB venv: `python (with duckdb)`. Order: `compute.py` -> `stops.py` (~30 s) -> `routes.py --data-dir DIR` (~35 s) -> `npm run build` (prebuild runs og.mjs ~50 s and copy-search.mjs).

## stops.py (per-stop delay, drives route search)
- Train numbers are reused for unrelated services and the source starts the same train at different stops. Keep a stop only when its planned time of day is stable (>=80% of runs within 30 min of the median) and it is served in >=30% of the busiest stop's runs. Order stops by median planned minute, not by position from the first recorded stop. Dropped numbers still work by number search.
- A station can have several ids (Berlin Hbf): merge by NAME.
- Trains with few runs are kept (>=3 measured) but show "few trips" instead of a percentage below 20 measured runs: a search that hides a real train looks broken.
- The source records only stops inside Germany. Foreign places exist only as `final_destination_station`. A train whose runs mostly (60%) end at one label that is not a German station gets that label as a 4th field (`foreign` list in stops.json); its delay is measured at the last stop in Germany and the page must say so. German labels that look foreign go in `NOT_ABROAD`. Trips that START abroad are not covered.

## routes.py (one page per ordered city pair)
- Built straight from the raw runs, NOT from stops.json: stops.json drops trains whose number is reused for different services, so a stops.json-driven version missed pairs entirely (Hamburg to Berlin: the source has 242 trains on the pair, stops.json kept 51 with both stations) and undercounted others. A run counts for A -> B only if it stops at A (with a departure) and later at B; delay = arrival delay at B. Pooling each train's arrivals at B counts runs that never stopped at A (Koeln->Berlin: 8,208 vs 6,163).
- Page rule: both stations have >=2000 runs ("major"), >=4000 measured arrivals, recent (last 3 months) planned time >=35 min (drops hops and pairs no train serves any more), >=2 listed trains with their own figure (>=20 measured runs); league (rank) needs >=10000. Coverage is a threshold choice, not a data limit: lower numbers add many pages that rest on few trips; page count drives build time and image count.
- The share on the page counts ALL measured runs of the pair; the train list shows only trains that still run regularly (>=3 runs in the last 3 months, planned departure within 30 min of the usual in >=80% of them). `unlisted` = measured trips on other trains; the method line must say so, otherwise the list looks like it disagrees with the headline.
- Also store the 6-minute share (DB's own "punctual" rule) next to the 15-minute one so the 15 cannot be called spin.
- Search shows the page's exact numbers for pairs that have a page (`public/search/routes.json`: `{slug: {l, n, t}}`) and opens the page; search still lists more trains (rare ones) for pairs it renders inline.
- Changing the page rule changes published numbers (existing pages shifted by up to ~2.5 points when reused-number runs were included) and can retire pages: say so when reporting.
- Station display names go through one rule in two places: `short()` in routes.py and `shortStation()` in lib/routeSlug.ts. Change both.

## Verify before shipping
- Recompute a few new numbers straight from the Parquet with a separate DuckDB script (no shared grouping code) and compare runs, measured and late share exactly. Done for per-stop, abroad (last German stop) and route numbers.
- Compare any two places that show the same number (search vs page): round to the same precision before concluding they differ.
- An independent check must reproduce the pipeline's scope rules too, not only its arithmetic: runs belong to the month of their scheduled START and only window months count, so a naive recompute over all rows of the files differs by a trip or two (22,469 vs 22,468) and looks like a bug in the pipeline.
- `scripts/compensation.py` (60+/120+ minute shares: network, month, type, route) follows the same definitions and aborts unless its route pairs reproduce routes.json exactly; see `compensation.md`.

## DuckDB / shell pitfalls
- Put DuckDB queries in a .py file: the command guard blocks a shell command that names a big .parquet path as a scannable script.
- Aggregates cannot be nested (HAVING avg(x = any_value(y))): compute the share in a subquery and join.
- `arg_max(col, seq)` skips rows where `col` is NULL, so several `arg_max` columns on one station can come from DIFFERENT rows (a station listed twice in a run, e.g. Berlin tief and oben, gave a cancelled stop row plus a later row with no delay, which looked punctual). Take the whole last row instead: `qualify row_number() over (partition by run, name order by seq desc) = 1`. Cross-check any such table against an independent query.
- Diagnose a missing pair by following the real trains through each filter (dropped entirely / unstable planned time / rare stop) before touching thresholds; the cause is usually a data-shaping filter, not a threshold.
- Python `%` formatting breaks when a label contains `%`; use f-strings in check scripts.
- A pipe to tail/head hides the real exit code: when a step prints failure words, re-run it unpiped.
