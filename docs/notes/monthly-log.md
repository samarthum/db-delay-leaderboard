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

