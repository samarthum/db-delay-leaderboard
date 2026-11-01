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

## Dry run on real data (PR #5)
Pending.
