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
