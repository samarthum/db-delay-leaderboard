# "The last 7 days" log (Nov 2026)

Data job: `docs/notes/data-pipeline.md` ("Last 7 days"). Screenshots of the final state: `docs/notes/last7/`
(mocked live box and week data; `tests/tools/last7-shots.mjs`).

Loop as in the home redesign: build -> screenshots at 390 / 320 (DE) / 1280 with full data, gaps, cancellations, a
day at another station, no runs, stale data -> a fresh senior-UX critic per round (brief: user stories, RULES, code,
screenshots; never my opinion) -> fix must-fixes and agreed should-fixes. Max 4 rounds. German: one independent
reviewer, four passes over every new string, all fixes applied.

User stories: (1) see at a glance how the train did last week at departure and final arrival; (2) never mistake
missing data for fine, nor a past day for today; (3) know which stations the numbers are for; (4) no clutter, live
status stays on top.

## Round 1 (3 must-fix)
Stale data still said "Updated every day"; a day that ended at another station sat under the usual destination's
label and counted in its average; the average used early arrivals as negative while the marks showed 0 (10 vs 11).
Fixed: stale line in ink, other-station days starred and not counted, early counts as 0 in the sentence. Should-fix
applied: thresholds in the key, sentence in regular weight, scope line, shorter German, "no runs" wording.
Rejected: "Abfahrt ab" (the German reviewer keeps "Abfahrt in").

## Round 2 (1 must-fix)
The other-station day was still a filled red mark under the wrong label. Fixed: drawn as not counted, footnote names
the row ("Tue 27 ended at Hannover Hbf, not Oberhausen Hbf"). Applied: note names the two stations and points to the
stop picker; key grouped (no wrap at 320 DE); stale line says the age; "15+ min" wording everywhere.

## Round 3 (2 must-fix)
Stale data still headed "The last 7 days"; other-station days vanished from the summary. Fixed: heading becomes "7
days to Mon 26 Oct" when 4-7 days old, block hidden after 7 days; such days are named in the sentence ("Ended at
another station on 1 day"). The critic's "count it as cancelled when the train turned back early" was not done: the
data cannot tell an early turn-back from a planned timetable variant, and a turn-back on the day already shows as a
cancelled final stop (×). Applied: lighter top rule (the history, the page's main figure, is not demoted), table
capped, legend swatch sizes, pointer to the stop picker says what it gives (live times and usual delays).

## Round 4 (last allowed; 3 must-fix, fixed after the round, not re-reviewed)
The hollow box meant four things; "No runs of ICE 224" under a live box showing it running read as a contradiction;
the key listed states the week did not show. Fixed: hollow box = no run only, "–" / "?" in ink without a box,
other-station day in its colour faded with a star; "No data for ICE 224 in Deutsche Bahn's records ..."; the key is
built from the states shown. Applied: "0 = no delay reported" on the grey swatch, key from 1-5 up, table full width,
stale age on its own line. Left: footnotes explaining partial runs (the sentence says "all or part of the way"),
moving the block to the right column on desktop, the fold's own German line break at 320 px (not this block).

## Summary
Must-fix per round: 3, 2 (1 + the round-1 follow-up), 2, 3. Story verdicts: round 1 stories 1 and 4 met; round 2
1-3 met with one exception; round 3 1 and 3 met, 2 failed on two edge cases; round 4 1 and 3 met, 2 partly, 4 not
met (block height: ~470 px at 390 with key and note), all round-4 must-fixes then fixed. The height is a judgement
for the owner: shorter would mean dropping the key or the two-row (departure + arrival) design asked for.
Tests: `tests/e2e/last7.mjs` (57 checks), `tests/data/test_last7.py` (9).
