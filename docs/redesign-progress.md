# Redesign: dark departure board, EN/DE (branch redesign-board)

Decisions (from the grill): purpose = "How late is your train, really?"; home = promise + one search box + one network line; result leads with the share of trips 15+ min late; deadpan tone; dark departure-board look; EN + DE; history only (no live status); mobile web first, desktop is the stretch; ranking/network/method on their own pages behind a tab bar.

Done (step 1): bilingual route trees (/ and /de/, separate root layouts via route groups, global-not-found), dictionary in lib/dict/{en,de} (scripts/check-dict.mjs verifies keys and placeholders), typeahead over trains, lines and stations (no model, public/search/ta.json, ~46 kB gzipped), new result card and train/line pages, dark share images in EN and DE, canvas "Save as image" card.
German copy: reviewed by two independent reviewer agents, all findings applied (glossary: mindestens 15 Minuten, im Schnitt, Fahrt, ausgefallen/Teilausfall, Median, ausgenommen).

Open / step 2: per-stop delay for long-distance trains (pipeline change) and natural-language route search ("8:14 Köln nach Berlin"); optional embedding fallback later. Station search today matches only a train's first and last stop.
Not done: real-phone test of Share / Save image; a second German read-through by a human if one becomes available; not pushed, not merged.

## Step 2: route search (branch route-search)
Per-stop delay for long-distance trains: scripts/stops.py writes data/stops.json (same window as compute.py). Route search ("8:14 Köln to Berlin", "München nach Hamburg", "cologne -> munich", "köln berlin") lists trains from A to B, closest to the typed time, with the share arriving 15+ min late at the stop where you get off. Parsing and matching are in lib/routeSearch.ts (no model); the file loads lazily (~0.6 MB, about 150 kB gzipped).
Data pitfalls found: train numbers are reused for unrelated services and the source starts the same train at different stops, so stops are kept only when their planned time of day is stable (80% of runs within 30 min of the median). That drops 192 of 1732 train numbers from route search (they still work by number). Station ids are merged by name (Berlin Hbf has two).
Cross-check: runs, measured, late %, average and cancelled at the alighting stop match an independent DuckDB query exactly for ICE 541 (Berlin Hbf), ICE 1541 (Hannover), ICE 521 (München), FLX 1233 (Berlin Hbf).
Not covered: regional trains, places abroad (answered with a message), live status.
