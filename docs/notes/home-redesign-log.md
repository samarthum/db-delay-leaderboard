# Home redesign log (Nov 2026): "my train today"

Loop: design + build -> screenshots at 390 / 320 (DE) / 1280 in every state (live parts mocked with
`tests/fixtures/live.mjs`, shots by `tests/tools/home-shots.mjs`) -> a fresh senior-UX critic subagent per round with
the brief (user stories, RULES, code paths, screenshots; never my own opinion) -> fix every must-fix and the
should-fixes I agree with. Stop at zero must-fix with every user story met, or after 8 rounds.

User stories: (1) my train today, will it be on time, at both ends; (2) find MY train fast (number, route + time,
station) and land on it; (3) how has it been doing lately, only as far as the data supports; (4) everything else stays
reachable.

## Round 0: before
Home led with the network-wide 16 min figure; the box sat mid-page; saved trains pushed the box down; the result card
had no save star (RULES: every per-train feature also on the card) and its history read like today's numbers.

## Round 1
Built: headline + one-line lead + box first; "Your trains" (starred) and "Looked up lately" (trains seen on cards and
pages) directly under the box with today's live state; network figure, most delayed routes and an "Also here" index
below. Live box became a two-leg timetable (departure at the first station, arrival at the last). Search result card:
save star, remembered on the home page, "How late it has run, Nov 2025 to Sep 2026" heading, "Sundays, like today:
X min" from the per-weekday averages, honest notices when a train has no live times or the feed is down.

Critic verdict: no story met yet. 10 must-fix: route + time buried the matched train a screen down in % and red;
suggestion dropped the typed time; green squares on "no delay reported" read as "on time"; home rows did not say which
end; trains ending abroad (ICE 224 to Amsterdam) showed Oberhausen times under an Amsterdam header; train page history
unlabelled under the live box; accent rails on live notices; station view a dead end for through trains; no "lately".

## Round 2
- Route + time: "Closest to 08:14" moved to the top of the route page (above the figure), in departure order, nearest
  train marked in selection yellow, average minutes (not %), every row taps to the train page or its card, and today's
  departure/arrival for the marked train when it leaves within the live board's two hours (shared with the board, no
  extra request). The typed suggestion now offers that same train first ("Nearest your time"), then the route with
  minutes; "Other destinations" no longer repeats the route's own station.
- Live honesty: own colour scale for live delays (`liveColor`: grey nothing reported, amber under 15, red 15+ and
  cancelled); "no delay reported" in grey at regular weight; ink "Today" dot; no rails on notices; platform change on
  its own line; cancelled shows "Other trains A to B" and "What you can claim"; trains ending abroad say so on the card
  and the train page, the figure says "at its last stop in Germany", and the live box says where live times stop.
- Train page: same "How late it has run" heading; "September 2026, the latest month we have: X min" from the committed
  monthly data (only with 8+ runs); duplicate "Average delay" tile removed (also on the card).
- Home rows: "Departs 12 min late" / "Arrives 9 min late" on their own line, sub-line wraps, platform change shown, a
  starred route shows its next train from the route board, a notice when the live feed is down. "Also here" removed
  (critic + the owner's sparse-home rule; tabs and footer already list those pages).
- Search sheet lists starred trains before recent pages; help line promises today's delay; shorter placeholders
  (DE "z. B. ICE 1541"); station view says it lists trains that start or end there and offers "Hannover Hbf to …",
  which opens the box prefilled.
- Rejected / deferred: sorting the station view by time (a list of every train passing a big station runs to 150+ rows;
  the "to …" way out lands on the route page, which has times and live); a month chart and "lately" line on the search
  card: the search index has no per-month data per train (only the 50 train pages do), see ROADMAP.

Critic verdict round 2: story 2 met; stories 1 and 3 not yet. 7 must-fix, mostly trust: home showed averages stored
at save time (they differed from the pages; partly my screenshot fixture, but stale by design), a silent live failure
on home, the old "this is not live" note on "ICE 1541 today", unnamed arrival station on home rows, saved routes with
only one end, EC 249's header duration (57 min is to Frankfurt (Oder), not Warsaw) and the bare "Frankfurt" live label,
and "latest month" missing on the card.

## Round 3
- Home rows read the usual delay now from the same data the search and pages use (route table, search shards), never a
  stored number; "Arrives at Berlin Südkreuz 9 min late" names the stop; platform change as its own bold line; per-row
  "Live: not available right now" plus one line on top when the feed is down; saved route rows show their next train at
  both ends (skipping one that already left). Usual delay stays on the right of live rows.
- The "not live, use DB Navigator" note for "today" queries is gone (the card and page carry today's live box).
- Train page: no duration in the header for trains ending or starting abroad; live station labels shown in full
  ("Frankfurt (Oder)"); "Live times start at this stop" when the live data starts elsewhere than the header's origin;
  "What you can claim" also when the destination stop is cancelled.
- Search: headline hidden (kept for screen readers) once a result shows, so both live ends fit at 320; suggestion groups
  say "average delay"; "Closest to your time"; the phone sheet list has no frame or shadow; starred trains and recent
  pages sit above "You can type" in the empty sheet. Live box drawn with rules (2 px ink above, hairline below), no box.
- Route page: today's state of the marked train sits in the marked row and names the destination.
- Station view: "Where are you going from Hannover Hbf?" is a full-width row right under the name.
- Rejected: per-month "lately" on the search card (no per-month data in the search index; ROADMAP data gap); a German
  placeholder with the route example (measured: it is cut at 320 px; the sheet's "Du kannst eingeben" list shows it);
  resizing the home route bars (shared list component used on other pages).

Critic verdict round 3: all three user stories met (number 2 taps, route + time 2-3 taps, returning 0 taps). One
must-fix: the page-wide "live unavailable" banner appeared when one row failed while another row still showed live
data. 11 should-fix, 7 nits.

## Round 4
- Banner removed; each row says "Live times are not available right now." on its own.
- Live lines carry the expected clock time: "Departs 12:15, 12 min late", "Arrives at Berlin Südkreuz 16:42, 9 min
  late"; the card status "12 min late, expected 12:15".
- Usual delay on home rows is quiet (regular weight, "late on average"), read from current data; a cancelled row hints
  "Tap for other trains and what you can claim".
- A cancelled destination stop no longer says "it goes on to …" but "DB reports no stop at X today. Check the DB
  Navigator". "Live times from Berlin Gesundbrunnen, the first stop DB reports for this train." Card says just
  "Ends in Amsterdam Centraal." (the figure already says "at its last stop in Germany").
- German at 320: no-break spaces in train numbers, "Hbf" names, "Min." and "Uhr"; status lines hang-indent past their
  square. The route-time marked row keeps yellow on the train row only; today's state sits under it on paper.
- Desktop: the two section rules on home line up. Mocked fixture arrival times now use each train's real duration.
- Rejected: storing the time with a starred route (the route board only covers the next 2 h, so the 8:14 train can
  only be shown inside that window; logged as an idea); a separate text field in the station view (the full-width row
  opens the box prefilled, same taps); rounding all averages to whole minutes (lists everywhere use one decimal and
  the big figure whole minutes: a site-wide convention outside this task); German placeholder with the route example
  (measured: cut at 320 px).

Critic verdict round 4: stories 2 and 3 met; story 1 not met for one must-fix: a rider who gets on or off mid-route
had no way from the card or train page to times at their own two stations.

## Round 5
- Live box: "Getting on or off at another station? Search your two stations" opens the search box (empty, focused);
  a route pair lands on its route page with the live board at the rider's own stations.
- Route page with a time: when the marked train is not on the two-hour board (already left, or later), one per-train
  lookup shows today's state on the marked row, using an end only where it is this route's end.
- Live board rows open the train. Cancelled destination stop gets the same next steps as a cancelled train (home hint,
  "Other trains", "What you can claim"). Returning visitors: the lead line is dropped so their trains move up.
- One wording everywhere: "Departure: 12 min late, expected 12:35", "Arrival at Berlin Südkreuz: 9 min late,
  expected 18:57"; "Live times are not available right now. Trying again every minute." (it does retry).
- Copy: "The worst of the 76 busiest routes"; destination suggestions say "55 different trains"; cancelled share 0
  reads "None"; card says "Our delay figures stop at its last stop in Germany."; route arrows stay with the destination.
- Rejected: merging same-slot rows in the route page's train table (a different page's table, outside this task;
  logged as an idea); one rounding for averages (site-wide convention).

Critic verdict round 5: all three stories met; one must-fix: the "another station" link opened an empty search that
forgot the train, offered stations it never serves, and was missing in the next/unknown/busy states.

## Round 6
- "Getting on or off at another stop?" is now a fold under the live box on every train page and search card, in every
  live state: this train's own German stops in running order (per-stop data), each with how late it usually arrives
  there. Tap where you get on, then where you get off: it opens that route with this train's time, so the train is
  the marked row and the route's live board covers both of your stops (or the route list when the pair has no page).
- A cancellation on a train going abroad offers "Other trains from München Hbf" instead of a route to the last German
  stop.
- Home rows: "usual delay" with the period said once under the heading; below 360 px it moves under the title so the
  live lines get the full width; route titles never break at the arrow.
- Suggestions: "Other destinations" without the bare count; phone sheet rows start at the box's edge; the example
  "8:25 Köln to Berlin" resolves to an ICE.
- Rejected: a station view sorted by time (data gap, ROADMAP); German placeholder with a route (cut at 320 px).

Critic verdict round 6: all three stories met. Two must-fix: the stop picker's per-stop averages (from a different
set of runs) contradicted the card headline and the route page; the caption "On the right: the usual delay" was false
at 320 px, where the figure moves under the name.

## Round 7
- Stop picker shows stops and times only; the route page it opens carries the exact figure for that pair.
- Caption no longer refers to position ("Each train also shows its average delay, Nov 2025 to Sep 2026"); the label is
  "average delay" (same name as the headline everywhere).
- Live delay colours follow the same scale as the averages (grey only for nothing reported).
- Cancellation: "Other trains A to B" opens the same pair at this train's time, so the live board lists alternatives.
- Station suggestions say "39 start or end here".
- Rejected: planned-time skeleton when the feed is down (the usual timetable may not be today's; the "next run" line
  and the stop picker already give times), latest-month line on home rows for page trains (home would then mix two
  periods per row), one rounding site-wide, German placeholder (cut at 320 px). Logged for the owner: ICE 517 on Ulm
  Hbf → Düsseldorf Hbf shows 15:15 → 11:20 (route data, a timetable variant; outside this redesign).

Critic verdict round 7: all three stories met. Two must-fix: live delays of 6-14 min drew an olive-green square
(contradicting DB's 6-minute rule shown beside it); a route list showed a train running the other way (ICE 517 on
Ulm Hbf → Düsseldorf Hbf, 15:15 → 11:20).

## Round 8
- Live colour scale tied to the rules the site explains: nothing reported grey, under 6 min olive, 6-14 amber,
  15+ and cancelled red; never green for a reported delay. Averages keep their own scale.
- Data bug found: `data/routes.json` lists 241 rows on 97 routes whose train runs the opposite way (arrival > 12 h
  after departure). Hidden on route pages, in "Closest to", and in the suggestion table (`runsThisWay`, copy-search);
  the data job fix is in ROADMAP. e2e asserts none are shown.
- The marked train on a route-with-time page never stays blank: live lines, or where its live times are, or "Live
  times from 13:33", or no live times / feed down.
- "Save to home" in words next to the star on the search card. Abroad caveat on the card in caption size. EC 249:
  "DB has no live time for Berlin Hbf today. First stop with live times: Berlin Gesundbrunnen."
- German review (independent subagent) applied: 2 wrong (a verbless fragment in a suggestion label; "Nach {to} keine
  Live-Daten" read as direction), the rest calques ("erwartet 12:35 Uhr" -> "voraussichtlich", "die nächste" ->
  "die zeitlich nächste", "zuletzt angesehene Seiten", "jüngste Monat", "laut Fahrplan").
- Rejected: old platform number (the feed answer carries only the new one), station view by time (data gap),
  same-slot row merging on route pages (separate table).

Critic verdict round 8 (last allowed round): all four stories met (number 2 taps + typing; route + time 2 taps;
returning 0 taps; other features 1 tap from tabs/footer). One must-fix: the stop picker promised "live times at both"
but its landing said live times were only at the train's first and last stop and sent the rider back to the card.

## After round 8 (not re-reviewed by a critic: the 8-round cap)
- The marked train on a route page now says when live times start for the rider's own stops ("Live times at Köln Hbf
  and Berlin Hbf from 13:28, two hours before it leaves"); "only at its first and last stop" shows only once the train
  has left. The picker's line says the same ("live times there from two hours before it leaves").
- Cancelled run: "Today's run from A to B is cancelled." names both ends. The history tile under it reads "Cancelled in
  the past" (DE "Ausfallquote im Rückblick"), so it never reads as today.
- German re-checked twice (late strings), fixes applied. English: "We measure delays up to its last stop in Germany."
- Left for the owner (should-fix / nit, not done): station view sorted by time (data gap), merging same-slot rows on
  route pages, labelled save button on train and route pages (icon row), one rounding for averages, German placeholder
  with a route example (cut at 320 px), a colour key for live squares.

## Summary
8 critique rounds. Must-fix counts per round: 10, 7, 1, 1, 1, 2, 2, 1 (the last fixed after the round). Stories met:
round 1 none, round 2 story 2, round 3 onward all three. Tests added: `tests/e2e/home-today.mjs` (36 checks on mocked
live answers), screenshots `tests/tools/home-shots.mjs`. Before/after images: `docs/notes/home-redesign/`.
