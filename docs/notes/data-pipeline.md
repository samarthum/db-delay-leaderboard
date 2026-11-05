<!-- Working notes carried over from the agent's project notes; paths point into this repo. -->
# Data pipeline: Parquet -> stats, stops, routes

Source: monthly Parquet in `$GP_PARQUET` (piebro/deutsche-bahn-data, CC BY 4.0), window set by `data/stats.json`. DuckDB venv: `python (with duckdb)`. Order: `compute.py` -> `stops.py` (~30 s) -> `routes.py --data-dir DIR` (~35 s) -> `connections.py` -> `compensation.py` (needs routes.json) -> `npm run build` (prebuild runs og.mjs ~50 s and copy-search.mjs). `scripts/monthly.py run --data-dir DIR` runs the five in this order; the monthly job does it for you (below).

## Stop order: planned time, then stop number (Nov 2026, owner's yes)
- Every place that picks a run's first/last stop or the previous/next stop orders the stop rows by planned time
  (arrival, else departure), then stop number (`STOP_ORDER` in compute.py; stops.py, routes.py, connections.py and
  compensation.py import it; live_trains.py and last7.py apply it in their own queries). NOT by stop number alone: rows
  numbered 100 and up are appended after the planned list (diversions: ICE 953 via Magdeburg 100 / Stendal 101 before
  Berlin Hbf 8; repeated stations: ICE 504 lists Berlin Hbf as stop 10 and 100), ~4.2% of long-distance runs, so "last
  stop by number" was a mid-route stop. piebro's reference query year.py still uses the number; the site does not.
- A station listed twice in a run at the same planned times (same station NAME, planned arrival and departure) is ONE
  stop: the row with the lowest stop number is kept (by name, not id: the copy usually carries Berlin Hbf's other id,
  tief / oben; by id the first real dry run found only 2 such groups), before anything is counted (run delay, cancelled, per-stop counts in
  stops.json, previous/next stop). `ONE_ROW_PER_STOP` in compute.py. Not applied to stations.json (arrivals per station
  id over all rows; ROADMAP).
- Rows without any planned time sort last (the monthly files hold none: `probe_direction.py` counts them).
- Independent re-implementations, not imports: verify_monthly.py (lowest number per group by window min, last stop as
  "latest planned arrival, then highest number" in two steps, first station by a text key), check_headline.py (grouping),
  verify_bins.py, verify_last7.py (plain dicts), compare_monthly.py, and a plain-Python one in test_monthly.py.
- The run delay is still "the arrival delay at the last stop that was not cancelled and has a planned arrival"; only
  which stop is "last" changed. Before/after on real data: `docs/notes/monthly-log.md` ("Last stop by planned time").

## Monthly refresh (.github/workflows/monthly.yml, since Nov 2026)
- When: daily 07:37 UTC on the 2nd-10th, plus `workflow_dispatch`. `scripts/monthly.py plan` says act=true only when the
  last finished month's `monthly_processed_data/data-YYYY-MM.parquet` is on Hugging Face AND `data/stats.json` ends
  before it; otherwise every later step is skipped (no-op, idempotent). It replaced `refresh.yml`, which re-ran
  `compute.py` alone (new stats beside old routes, stops, connections).
- Window: compute.py keeps the latest 12 published months with full station coverage (`PUBLISHED_MONTHS`, 1,000+
  stations); `--until <plan month>` keeps a later (partial) file out. Oct 2026 makes it Nov 2025 - Oct 2026 (12 months;
  Oct 2025 was partial); from then on it rolls (start and end move one month).
- Merge per field: every history file is rewritten for the new window by the current scripts (all their fields come
  from them: checked by the gate, which fails if any key path or record position of a committed file vanished). The
  RULES' "never overwrite wholesale" is about a local window that differs from the committed one; here it is the whole
  published window by construction.
- Verify (fails the job on any difference): `tests/data/verify_monthly.py` recomputes from the Parquet, with no shared
  code, stats/monthly (both categories), every train and line page, every search record of every kind (incl. the
  latest months), stations, a sample of stops.json trains, every route and every route row (and that none runs the
  other way), the change-time ladder of the two busiest stations, compensation; `tests/data/verify_bins.py`
  (connection pairs, 5 trains, kept cases or the busiest); `scripts/check_headline.py`.
- Recompute (`gh workflow run monthly.yml -f recompute=true`, Nov 2026): `plan --recompute` acts on the COMMITTED window
  (until = its last month), for a rule change; same download, pipeline, verifiers and commit (message "data: recompute
  window ..."); the gate runs `--expect recompute`: window unchanged, runs per month unchanged in every month (a run's
  existence does not depend on where it is measured), monthly averages move at most 2 min and measured counts at most
  5%. `tests/data/compare_last_stop.py` writes the before/after into the job summary. Pull-request dry runs without a
  new month use the same `recompute` expectation (a PR may change a rule).
- Gate (`monthly.py gate --old <copy of data/>`): window contiguous and end +1 month (start same or +1, 12 at most);
  every file names the same window; months both windows hold and whose source file has the same size are unchanged,
  except the OLD window's last month, which may shift a little (runs that start on its last evening and end after
  midnight take their final stop from the new month's file; Oct 2026: 57 of 30,497 long-distance runs, average
  18.458 -> 18.471 min): at most 1% of runs and measured runs and 0.5 min, `EDGE_MAX_*` in `monthly.py`; the note on a
  partial month (`window.skipped`) may disappear once that month's file has left the 12 published months;
  the new month's runs within 0.75-1.33x the median month, 80%+ measured; route pages, train/line pages, search units
  per kind, stops.json trains, connection stations and arriving trains, stations: at most 10-60% gone (per family)
  and not shrunk; no route row backwards; median route trips new/old 0.8-1.3; sizes 0.7-1.5x and under caps. It prints
  what changes (headline, route pages gone/new, biggest route moves, train pages gone/new) into the job summary.
- Commit: only `data/{stats,monthly,stations,stops,routes,connections,connection-pairs,connections-daypart,compensation}.json`
  and `data/{trains,lines,search}/*.json`, as github-actions[bot], `git pull --rebase` then push to main (4 tries),
  only from main. Pull requests touching the pipeline get a dry run (summary, artifact `monthly-data`) and the route
  fix re-run on the committed window (`tests/data/compare_routes.py`).
- Tests without network: `tests/data/test_monthly.py` (synthetic months from `tests/data/monthly_fixture.py`, incl. a
  train whose stop numbers run backwards on Wednesdays; also the job's first step). Log: `docs/notes/monthly-log.md`.
- Not in the job: `live_trains.py` / `border_stations.py` (read the last two months; live lookups) and share images
  (drawn by the Vercel build).

## Search records: latest months (field 17, Nov 2026)
`data/search/s-*.json` records (not the `n-*.json` number lists the ROADMAP item named) end with
`[[month, measured runs, avg], ...]`: the last 3 window months for long-distance trains, the last 1 for regional lines
and train numbers (3 for all 34k records would add a third to every shard, measured ~+34% gzip; 1 adds ~10%). Same
numbers as a train page's monthly series. The card shows "<month>, the latest month we have: ..." (strings `res.lately`,
already reviewed for the train page) only for the window's last month with 8+ runs (`LATEST_MONTH_MIN_RUNS`,
`lib/searchCore.ts`, also used by the train page); old data without the field shows no line.

## stops.py (per-stop delay, drives route search)
- Train numbers are reused for unrelated services and the source starts the same train at different stops. Keep a stop only when its planned time of day is stable (>=80% of runs within 30 min of the median) and it is served in >=30% of the busiest stop's runs. Order stops by median planned minute, not by position from the first recorded stop. Dropped numbers still work by number search.
- A station can have several ids (Berlin Hbf): merge by NAME.
- Trains with few runs are kept (>=3 measured) but show "few trips" instead of a percentage below 20 measured runs: a search that hides a real train looks broken.
- The source records only stops inside Germany. Foreign places exist only as `final_destination_station`. A train whose runs mostly (60%) end at one label that is not a German station gets that label as a 4th field (`foreign` list in stops.json); its delay is measured at the last stop in Germany and the page must say so. German labels that look foreign go in `NOT_ABROAD`. Trips that START abroad are not covered.

## routes.py (one page per ordered city pair)
- Direction by PLANNED TIME (Nov 2026): a run counts for A -> B when its last row at B is planned after its earliest
  departure at A. Stop numbers (`train_line_station_num`) run against the direction of travel in a few runs per train;
  the old `seq(A) < seq(B)` rule put 241 rows of trains running B -> A on 97 A -> B pages (ICE 517 on Ulm -> Düsseldorf,
  15:15 -> 11:20) and counted those runs in the pages' runs/trips/shares/cancelled/train count while the right
  direction missed them. compensation.py mirrors the rule; the curve (stops between A and B) uses times too.
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

## Last 7 days (scripts/last7.py -> data/last7.json, daily)
Per long-distance train number and service day: departure delay at the first German stop, arrival delay at the last
German stop, cancelled, or no data. Shown on every train page and search card (`components/LastWeek.tsx`). Runs daily in
GitHub Actions (`.github/workflows/last7.yml`); tests `tests/data/test_last7.py` (fixture), independent check
`tests/data/verify_last7.py`, UI `tests/e2e/last7.mjs`.

### The raw files (inspected Nov 2026 from piebro's code; Hugging Face was blocked from the build sandbox)
- Path `raw_data/year=YYYY/month=M/day=D/date_YYYY-MM-DD_hour_HH_HH....parquet`. The FOLDER is the UTC day of the
  fetch (piebro's runner clock, `datetime.now()` on GitHub Actions); the FILE NAME is the plan date and the Berlin plan
  hours it holds. One fetch run that covers hours of two dates writes two files (and fetches `fchg` twice). Older files
  may be named `.../day=D/hour_HH_HH.parquet` (same meaning).
- Columns: `timestamp` (fetch time, naive, UTC), `url`, `api_name`, `query_params`, `response_data` (the raw answer),
  `status_code` (a STRING, "200"), `error`, `duration_ms` (+ year/month/day partition ints). One row per API call.
- `api_name` values used: `timetables/v1/plan` (url `.../plan/<eva>/<yyMMdd>/<HH>`: the planned stops of one station
  and hour) and `timetables/v1/fchg` (url `.../fchg/<eva>`: every known change at a station, about 6 hours back).
  Also `station-data/v2/stations` and `fasta/v2/facilities` (ignored). Failed calls have another status code.
- XML: `<timetable station="..."><s id="<trip>-<yyMMddHHmm start>-<stop no>">` with `<tl c="ICE" n="123" t="p" .../>`
  (type, number; t="e" extra train), `<ar>` / `<dp>` with `pt` planned, `ct` changed time, `cs` status (c cancelled,
  p planned/reinstated), `clt` cancellation time, `ps="a"` additional stop, `ppth` planned path; `<ref><tl/></ref>` in
  fchg names the train a replacement replaces. fchg entries usually have no `tl`: they are matched to the plan by id.
  Times are Berlin wall clock.
- Schedule (piebro `fetch_and_upload_data.yml`): cron 03:17, 09:17, 15:17, 21:17 UTC, but real runs land about 3 a
  day, 4-11 h apart (late Oct 2026: ~00:30-02:00, ~09:00-11:00, ~15:00-21:00 UTC; GitHub skips or delays cron runs).
  Each run fetches the plan for the Berlin hours from 10 h back to 2 h ahead that are not on Hugging Face yet (repairs
  gaps, so plan hours are almost never missing), plus one fchg per station (~5,400 stations, categories 1-7), then
  uploads (one Hugging Face commit). A week of raw files is ~1.5 GB (about 40 files of 3-66 MB).

### Rules (same as piebro's monthly stop table + compute.py)
Decision (Nov 2026, owner delegated to the coordinator): a 7-day cell is measured EXACTLY like a day of the site's
11-month history, which comes from piebro's monthly processed files built from these same raw answers. Consistency
with the numbers already on the site beats a stricter rule nobody else applies. Proof: `tests/data/compare_monthly.py`
(PR dry run, a September 2026 week against `data-2026-09.parquet`; result in `last7-log.md`).
- Stop rows: latest plan snapshot per stop id, latest fchg snapshot per id among those that carry a change (piebro's
  filter), full outer join; changed time = fchg `ct`, else the planned time (a stop with no change record counts as no
  delay: say "no delay reported"); cancelled = `cs == "c"` if `cs` is set, else `clt` present (reinstated is not
  cancelled); replacement = tl t="e" or a `ref`; additional = ps="a". Rows with no time at all are dropped (as in the
  monthly files).
- Scope: compute.py's long-distance types (ICE IC EC ECE RJ RJX FLX TGV WB), no replacement trains. A run is all stops
  with the same `<trip>-<start>` id prefix; it belongs to the day of its scheduled start (min planned time); delays
  outside -10..600 min are not measured (null). A number running twice on one day keeps the earlier run (logged).
- Departure = the first stop with a planned departure; arrival = the LAST stop with a planned arrival (the planned
  final German stop, cancelled or not); first and last by planned time, then stop number, a station listed twice at the
  same planned times counted once (the monthly history's rule since Nov 2026; compare_monthly.py reads piebro's file
  with the same rule and reports how many ends "by stop number" would move). This differs on purpose from the 11-month figure, which measures
  at the last stop actually served: a rider at the final stop needs to see "cancelled" there.
- Whole run cancelled = every timed stop cancelled -> "x". An end stop cancelled -> that end "x".
- Window: the 7 newest COMPLETE service days. A day is complete once a change list exists from 10:00 Berlin the next
  day (piebro's 09:17 UTC fetch): the last trains arrive after midnight, overnight ICEs about 07:00-08:00, and fchg
  keeps an event only ~6 h. The newest complete day is yesterday at best.
- "?" only for true holes, where the plan answer itself is missing at an END of the run: (a) a stop with a change
  record but no plan record (not an extra stop; matched by ride id, such entries rarely name their train) numbered
  before the run's first departure or after its last arrival (still by stop NUMBER against the chosen ends' numbers:
  such a stop usually has no planned time; a missing row numbered 100+ therefore marks the day "?", the cautious side), or the run has no such end at all; or (b) a plan hour no
  raw file holds within 2 h before the first or after the last planned stop (the real end may sit in that hour). A
  hole between the ends does not matter: the ends are still measured, as in the monthly build. The per-day missing
  plan hours are in `gaps`. A day with no run in the data is null, as the monthly build would also have nothing.
- Known bias, the same as in the 11-month history (disclosed on "How we measure"): fchg holds an event only ~6 h, and
  fetch runs are often 8-11 h apart. A delay announced and over inside such a stretch is never seen; the stop keeps its
  last forecast, or its planned time if no change list ever held it (fixture: ICE 100 on 27 Oct reads the 4-min
  forecast, really 9; ICE 300 departs "0", really 6). Until Nov 2026 such runs were "?" (a 7 h fetch-gap rule), which
  on real data left 1 of 7 days with 300+ measured runs (Actions run 41328492652); the rule was dropped, not tuned.

### Output and size
`{"asOf", "dataTo", "days": [7 ISO dates], "gaps": {date: [Berlin hours]}, "stations": [names], "trains": {"ICE 123":
[usual first stop idx, usual last stop idx, [7 cells]]}}`; a cell is null (no run in the data), "x", "?", or
[dep, arr] (minutes, "x" or null), with [dep, arr, first idx, last idx] when that day's ends differ from the usual
(an index of null = the usual stop, -1 = that day's run had no such stop, e.g. no stop with a planned departure;
`copy-search.mjs` turns -1 into null, so the site shows "–" in the usual row).
Every long-distance number seen in the week is in it, so every card (not only the 50 train pages) has it. Measured
with a synthetic week at full scale (1,732 trains, the real station list): 124 kB, 40 kB gzip. `copy-search.mjs` splits
it into `public/last7/<first two digits>.json` (~1-2 kB each, like the search shards) plus `index.json`; a missing file
gives an empty index (no 404 in the console). Per-stop 7-day data for the "Getting on or off at another stop?" picker
was left out: ~10-15 stops per train would make it ~10x bigger (~1.2 MB, 400 kB gzip) for a fold few open; the block
says it is for the whole run and names both stops.

### Verify
`tests/data/verify_last7.py` re-derives the window, the missing hours and every cell for a sample (all train pages,
every train with a cancellation or "?", a spread of the rest) with regular expressions and plain dicts (no lxml, no
DuckDB), and the workflow refuses to commit on any difference. `tests/data/compare_monthly.py` (pull requests only, a
separate job) checks the rule itself against piebro's monthly file; on the fixture, piebro's own
`parse_monthly_xml.py` + `create_monthly_data_release.py` agree with last7.py on 79 of 79 ride ends. `scripts/last7.py --check` gates the commit: 7
consecutive days, asOf at most 4 days old and never older than the committed one, 600+ trains, 5+ days with 300+
measured runs, under 400 kB.
