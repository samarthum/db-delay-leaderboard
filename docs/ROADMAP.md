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

## Next (owner picks the order)
1. **Monthly report card.** A shareable monthly summary ("October: long-distance trains averaged 17 min late, worst
   route X"), page + portrait share picture, EN + DE. Draft first; the owner approves before anything is posted.
   Needs a new month of Parquet data and a small `scripts/` job; reuse `og.mjs` card pieces.
2. **Europe league.** Compare punctuality across countries. Needs each country's open data, licence checks per source,
   and for some (NL, CH, AT) free accounts that only the owner can create. Biggest job; start with a source survey.
3. **Notifications** ("your 08:14 is +20"). Needs a server that checks saved trains on a schedule plus push or email.
   Owner: wait until there is traffic (it costs money and upkeep).

## Data gaps found by the home redesign (story: "how has my train been doing lately?")
- **Last 7 days per train**: no data. History is monthly (Parquet, Nov 2025 - Sep 2026) and the live collector
  (`gp-collect.service`, gtfs.de feed) is stopped. To fill it: restart the collector (or poll DB Timetables `/fchg`
  for saved trains), store per-run final delays, then show "last 7 days: X of Y runs 15+ min late" on card and page.
  Note the free gtfs.de feed covers ~66% of ICE/IC and almost no EC/ECE/RJ (see live-and-international notes).
- **Latest month on the search result card**: only the 50 train pages carry per-month averages; the search index
  (`data/search/n-*.json`, from `scripts/compute.py`) has none. Add a `[month, runs, avg]` field for the last 1-3
  months per unit, recompute from Parquet, verify independently (RULES), then show the same "latest month" line the
  train page has. Card parity rule depends on it.
- **Station view by time**: the station list only has trains that start or end there, by delay. A time-sorted list of
  every train calling there needs per-station times in the typeahead data (they exist in `stops.json`).

## Smaller ideas and open decisions
- Delete or redirect `/more/` (unlinked).
- Voice search: decide whether to fix or remove (switched off, owner found it buggy).
- Station pages with a live departures board (route pages have one; stations do not).
- Live: compare today's delay with the usual ("+12 now; usually +7 at this point").
- Fill the remaining trains from abroad faster (run `scripts/foreign_origins.mjs` on a weekday and a weekend day).
- Refresh history data monthly (new Parquet month -> compute.py, stops.py, routes.py, connections.py, compensation.py),
  merging per field and re-verifying (see `docs/notes/data-pipeline.md`).
- Check the Free-plan terms of the DB API Marketplace for public use.
- Rebuild the older test suites that were lost (live-unit with a DB mock, share-image size, voice) into `tests/`.
- Custom domain (`NEXT_PUBLIC_SITE_URL`, see README).
