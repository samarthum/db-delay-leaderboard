# Roadmap and ideas

Order agreed with the owner. Done items stay listed briefly so the history of decisions is clear.

## Done
1. Route pages + share cards; route-pair coverage fixed.
2. "Will my connection work?" (Change trains), then live delay in it.
3. Compensation page (three legal review rounds), then the plain-language redesign with calculator (1 Nov 2026).
4. Live status: route board, train pages, search result cards, saved trains ("Your trains"), next-run line.
5. Mobile redesign v2 (phone-first, search sheet, sticky titles), average delay as the headline number everywhere.
6. Trains from abroad: real origin, route search from abroad, border stations live, departure abroad via Transitous.
7. Weekly refresh job for the abroad data. Repo made public under MIT.
8. Home redesign around "my train today" (1 Nov 2026; branch, owner's yes pending): log in `docs/notes/home-redesign-log.md`.
9. New brand mark: flustered little train in the header, favicon and home-screen icon (live on main since 1 Nov 2026). Share cards and Android home-screen icons (web manifest) carry it too.
10. Last 7 days per train on every train page and card, from piebro's raw files, refreshed daily by GitHub Actions
   (Nov 2026, PR; owner's yes pending): `docs/notes/data-pipeline.md` ("Last 7 days"), log `docs/notes/last7-log.md`.
11. Monthly history refresh in GitHub Actions with independent verification and a sanity gate; route-direction fix;
   latest month on the search card; deterministic next-run test (Nov 2026, PR #5): `docs/notes/monthly-log.md`.

## Next (owner picks the order)
1. **Monthly report card.** A shareable monthly summary ("October: long-distance trains averaged 17 min late, worst
   route X"), page + portrait share picture, EN + DE. Draft first; the owner approves before anything is posted.
   Needs a new month of Parquet data and a small `scripts/` job; reuse `og.mjs` card pieces.
2. **Europe league.** Compare punctuality across countries. Needs each country's open data, licence checks per source,
   and for some (NL, CH, AT) free accounts that only the owner can create. Biggest job; start with a source survey.
3. **Notifications** ("your 08:14 is +20"). Needs a server that checks saved trains on a schedule plus push or email.
   Owner: wait until there is traffic (it costs money and upkeep).

## Data gaps found by the home redesign (story: "how has my train been doing lately?")
- ~~Last 7 days per train~~: done (item 9), from piebro's raw files (updated every 6 h), not the stopped collector.
  Left open: per-stop 7-day data for riders getting on/off mid-route (~10x the file; the block says "whole run");
  check the first real runs' logs for the fchg reach-back and file sizes (data-pipeline notes).
- ~~Latest month on the search result card~~: code done (Nov 2026, PR #5): search record field 17 (`s-*.json`),
  verified by `verify_monthly.py`, card line = the train page's. Shows once the monthly refresh writes the field.
- ~~Route lists include trains running the other way~~: fixed in `scripts/routes.py` (direction by planned time; the
  hidden rows also fed route runs/trips/shares/cancelled/train count, see `monthly-log.md`). **Left:** remove
  `runsThisWay` (`lib/routePage.ts`, `components/pages/RoutePage.tsx`, `scripts/copy-search.mjs`) once refreshed
  data with 0 backward rows is live.
- **A run's last stop by planned time (decide)**: 4.2% of long-distance runs carry stop rows numbered 100+ (diversions,
  repeated stations), so `compute.py`'s "last stop by number" can be a mid-route station (ICE 504: Berlin Hbf, not
  Hamburg-Altona). Routes were fixed (planned time); the headline, train figures, compensation and connections still
  use stop numbers, like piebro's reference query. Changing it moves published numbers: `docs/notes/monthly-log.md`.
- **Station view by time**: the station list only has trains that start or end there, by delay. A time-sorted list of
  every train calling there needs per-station times in the typeahead data (they exist in `stops.json`).

## Ideas left from the home redesign critique (owner to pick)
- A starred route remembers the time it was starred with (`?t=`), so home shows "your 08:14" instead of the next train.
- Same-slot rows on route pages ("06:53 ICE 2479 / 1925 / 2285, few trips") merged into one row.
- "Save to home" in words on train and route pages too (the card has it).
- One rounding for a train's average (big figure whole minutes, lists one decimal today).
- German placeholder with a route example once the box is wider, or a shorter wording that fits 320 px.

## Smaller ideas and open decisions
- Delete or redirect `/more/` (unlinked).
- Voice search: decide whether to fix or remove (switched off, owner found it buggy).
- Station pages with a live departures board (route pages have one; stations do not).
- Live: compare today's delay with the usual ("+12 now; usually +7 at this point").
- Fill the remaining trains from abroad faster (run `scripts/foreign_origins.mjs` on a weekday and a weekend day).
- ~~Refresh history data monthly~~: done (`.github/workflows/monthly.yml`, Nov 2026). Open: also refresh
  `live_trains.py` (live lookups read the last two months; matters at the December timetable change).
- Check the Free-plan terms of the DB API Marketplace for public use.
- Rebuild the older test suites that were lost (live-unit with a DB mock, share-image size, voice) into `tests/`.
- Custom domain (`NEXT_PUBLIC_SITE_URL`, see README).
