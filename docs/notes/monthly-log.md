# Monthly refresh log (Nov 2026)

Job: `.github/workflows/monthly.yml`, rules in `docs/notes/data-pipeline.md` ("Monthly refresh"). One entry per
dry run or real refresh: window, verifier and gate result, what changed.

## Build (1 Nov 2026, PR #5)
- Hugging Face is blocked from the build sandbox, so the pipeline, gate and verifier were built against synthetic
  months (`tests/data/monthly_fixture.py`, 5 months, ~100k rows each) and proven there (`tests/data/test_monthly.py`,
  25 checks): verify_monthly agrees with every file family (15,589 values, 0 differences), and catches each planted
  error (a backward route row, a search month's average, a regional number's month count, a train page's month count,
  a stops.json count, a ladder count); the gate refuses a window that did not move, a vanished field, records that
  lost a position, half the route pages gone, a backward row.
- Route direction: on the fixture the old rule lists ICE 517 (stop numbers reversed on Wednesdays) on 6 reverse
  routes; the time rule on none. The hidden rows did feed route-level figures: 23 of 34 fixture routes changed (runs,
  trips, 15+/6+ share, cancelled share, train count), and 14 right-direction rows gained the runs that had been
  counted the other way. Real numbers: dry run below.
- Decisions: (1) `refresh.yml` deleted (it would have committed compute.py-only output the first Monday after
  October appeared). (2) Field 17 holds 3 months for long-distance trains and 1 for regional records (shard size).
  (3) The `runsThisWay` filter stays in `lib/routePage.ts` / `copy-search.mjs` until refreshed data with 0 backward
  rows is live; remove it in a follow-up. (4) A run more than one month behind still runs but the gate refuses it (a
  person looks). (5) `live_trains.py` is not part of the job (live lookups; separate decision).

## Dry run 1 on real data (1 Nov 2026, Actions run 41345511172, head 128dbee)
- Plan: October 2026 is NOT on Hugging Face yet (newest published 2026-09), so act=false and the PR ran a same-window
  recompute (Nov 2025 - Sep 2026, 11 months; Oct 2025 skipped as partial, 131 stations). Download 12 files in ~80 s.
  Pipeline 12 min (compute 188 s, stops 12 s, routes 17 s, connections 468 s, compensation 15 s): 7,062,785 runs,
  1,061 long-distance trains in the pool, 687 route pages (committed: 685), 1,985 stops.json trains, 143 connection
  stations, 1,242 arriving trains in connection-pairs; compensation reproduces routes.json on all 687 pairs.
- Verifier: 236,103 values. Exact on every long-distance family: routes.json 63,394 values and 23,158 train rows,
  **0 rows running the other way** under the time rule; all 1,732 search trains incl. the new latest-months field;
  50 train pages; 4,532 stops values; 4,258 stations; compensation; the ladder of the two busiest stations.
- 157 differences, all regional: rides moved between lines (RB 1 11,244 vs 11,240 runs; 659 vs 660 lines; a few
  regional numbers off by one ride). Cause: compute.py took a ride's line and number with `any_value()`, arbitrary
  for a regional train that changes line or number en route, so the pipeline itself was not reproducible there.
  Fixed: `min()` in compute.py and the verifier; the fixture now has such a ride (RE 4 -> RE 50).


## Dry run 2 (1 Nov 2026, Actions run 41347435494, head bbe26f7; same window, October not yet published)
- Verifier: **236,115 values, 0 differences** (regional lines and numbers now agree after the `min()` fix);
  verify_bins 13 pairs, 0 differences; check_headline within tolerance.
- Gate: 56 of 57 checks passed. Same window, so months unchanged and route trips median new/old 1.000. Route lists
  23,223 -> 23,158 rows, **0 rows running the other way**; route pages 685 -> 687 (`bitterfeld-berlin-suedkreuz`,
  `koeln-hbf-muenchen-hbf`: their right-direction runs had been counted the other way). Search shards 5,432 ->
  6,091 kB (+12%, field 17). Line pages: `rb-34-idar-oberstein-nohen` out, `rb-40-muenchen-ost-ampfing` in (the
  deterministic line rule moved a few rides); search lines 645 -> 644, regional numbers 31,552 -> 31,528.
- The failed check was the gate's own threshold: "70% of trains have figures for the last month"; really 1,203 of
  1,732 (69%) in a normal month, the rest did not run in September. Lowered to 50% (it is there to catch a missing
  or empty month). The route-fix comparison now runs before the gate so it always reports.

## Dry run 3 (1 Nov 2026, Actions run 41349833081, head 263c325): green
- Verifier 236,119 values, 0 differences; verify_bins 13 pairs, 0; all 55 gate checks passed (same window).
- Route fix on the committed window (`compare_routes.py`): rows running the other way **241 on 97 routes -> 0**;
  route pages 685 -> 687. But 654 of 685 routes change a route-level figure: runs on 635 (largest Frankfurt
  Flughafen -> Köln Messe/Deutz 8,713 -> 8,366), trips 621, 15+ share 349 (largest Köln Messe/Deutz -> Frankfurt
  Flughafen 21.8 -> 24.0%), 6+ share 314, average 292 (largest Stendal -> Berlin Hbf 13.8 -> 15.0 min), cancelled 191,
  planned minutes 18. Far more than the 97 routes with visible backward rows: `tests/data/probe_direction.py` (next run)
  counts runs whose stop numbers disagree with planned times and shows sample runs for those pairs.

## Dry run 4 (1 Nov 2026, Actions run 41351639627, head 98ca83d): green; why 654 routes move
`probe_direction.py` on the committed window: **14,000 of 336,428 long-distance runs (4.2%)** have stop rows whose
numbers disagree with their planned times; 12 are fully reversed. They are rows numbered **100 and up**, appended after
the planned stop list: diversions (ICE 953 Köln -> Berlin diverted via Magdeburg 100 / Stendal 101, 19:31, before
Berlin Hbf 8, 20:17) and repeated stations (ICE 504 München -> Hamburg lists Berlin Hbf as stop 10 AND as stop 100 with
the same times). The stop-number rule therefore counted ICE 504 / ICE 600 for Stendal -> Berlin (Berlin's "last" row
was 100, after Stendal 12) and missed the diverted ICE 953 runs that really went Stendal -> Berlin. Every sampled
"only old rule" run was wrong, every "only new rule" run right (Stendal -> Berlin: old 8,375 runs, new 8,543; 75 only
old, 243 only new). So the 654 changed routes are a correction, not a side effect.

**Open (owner to decide; not changed here):** the same 100+ rows affect `compute.py`'s run delay, "the arrival delay
at the last stop (by stop number) not cancelled" (as piebro's reference query year.py does): for ICE 504 that is the
duplicate Berlin Hbf row 100, not Hamburg-Altona. ~4% of long-distance runs may be measured at a mid-route stop. A
fix (last stop by planned time) would move the headline, every train figure and compensation; it needs its own
verification and the owner's yes. `connections.py`'s previous/next stop (by stop number) has the same blind spot.

## Last stop by planned time (2 Nov 2026, PR #6; owner's yes to the open question above)
Decision: every place that picks a run's first/last stop or previous/next stop orders the stop rows by planned time
(arrival, else departure), then stop number; a station listed twice at the same planned times is one stop (lowest stop
number). Applies to the history (compute, stops, routes, connections, compensation), `live_trains.py` and the 7-day
block (`last7.py`), so the 7-day and 11-month numbers are measured the same way. Rules: `data-pipeline.md` ("Stop order").

**Dry run on real data** (Actions run 41404013877, head 7c32bed, same window Nov 2025 - Sep 2026; October not yet
published): verify_monthly **236,117 values, 0 differences** (it implements the rule on its own), verify_bins 13 pairs
0, check_headline within tolerance (long-distance 18.80 vs 18.76), gate `--expect recompute` 59 of 59 (runs per month
unchanged in all 11 months both categories; monthly long-distance average moved at most 0.8 min, measured at most 0.04%).
`compare_last_stop.py` (both rules from the Parquet; "before" equals the committed stats.json):
- Measuring stop moves for **11,073 of 336,428 long-distance runs (3.29%)**, 11,072 of them because the old rule picked
  a row numbered 100+; delay changes on 10,688. Regional: 19,069 of 6.7 M (0.28%).
- Headline (Jul-Sep 2026), long-distance: **average 18.1 -> 18.8 min**, 15+ min late 38.1 -> 38.8%, 6+ 57.4 -> 57.9%;
  regional 4.08 -> 4.10 min. Measured runs and cancellations unchanged (to within 41 of 310,559).
- 1,732 long-distance trains: 440 unchanged, 111 under 0.1 min, 510 0.1-0.5, 281 0.5-1, 250 1-2, 122 2-5, 18 more than 5
  min. Top movers, each checked by hand against its raw stop rows (the old stop was always a row numbered 100+ planned
  before the real end, the new one the planned final stop): IC 2400 27.5 -> 40.0 (Bonn-Beuel 101 at 19:15 vs Stuttgart
  Hbf 10 at 22:23), ICE 2600 16.0 -> 27.8 (Salzwedel 100 between Stendal 3 and Uelzen 4; Hamburg Hbf 6), RJ 13462 8.4 ->
  18.0 (Neumünster 100 before Schleswig 2), EC 458 29.7 -> 37.9 and IC 60408 30.6 -> 37.4 (Nürnberg Hbf 100 between
  Leipzig and Karlsruhe; Freiburg), ICE 1251 7.9 -> 15.6 (Viersen 100 before Mönchengladbach 4; Frankfurt Hbf 8), ICE 2590
  39.3 -> 46.8 (Frankfurt Süd 100; Berlin Südkreuz 13, the last stop not cancelled), ICE 1695 11.1 -> 18.6 (Würzburg 101;
  München Hbf 8), IC 2802 18.4 -> 25.4 (Lehrte 100; Hannover Hbf 7), ICE 2580 7.8 -> 14.1 (Löhne 100; Aachen Hbf 18).
- Files (committed vs new; routes and compensation routes also carry the Nov 2026 route-direction fix, first published
  here): search train averages 1,195 of 1,732 changed (largest 12.5 min), train pages 32 of 45, route trips 621 of 685,
  compensation per month 32 of 33; train pages in/out: ec-458, ic-60408, ice-542, ice-652, ice-655 in; flx-1243,
  ic-60403, ice-553, ice-651, ice-855 out; route pages 685 -> 687.
- 7-day block, PR dry run (run 41404013787): compare_monthly 13,784 of 13,784 ride ends agree exactly with piebro's
  September file read with the same rule; the old rule would have put 233 of 14,160 ends elsewhere.

**Follow-up (same day): duplicates by station name.** The probe found only 2 same-ID duplicate groups: the repeated
rows (ICE 504 / ICE 654: Berlin Hbf as stop 2/10 and again as 100 at the same times) carry Berlin Hbf's other station
id (tief / oben). Like the rest of the pipeline, the rule now keys on the station name (commit 023563e; fixture ICE 705's
copy uses the other id). Published 2 Nov: recompute run 41406932683 (station-id version, triggered on main), then a
second recompute with the name rule (below).
