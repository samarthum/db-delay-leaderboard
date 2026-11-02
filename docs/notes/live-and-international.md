<!-- Working notes carried over from the agent's project notes; paths point into this repo. -->
# Live status and international data

## Trains from abroad (live on main c13aafb, Nov 2026)
- Repo is PUBLIC, MIT (owner chose this so Transitous can be used). Before any history change run `tests/tools/secretscan.py`: it checks known key values and patterns over every blob.
- Real origins: `scripts/border_stations.py` writes the EVA of each first recorded stop. `scripts/foreign_origins.mjs` asks the DB Timetables plan at the border and takes the first `ppth` entry (48 calls/min). It only finds trains running today/tomorrow, so the file merges and never shrinks. Output: data/foreign-origins.json (134). copy-search.mjs puts the real origin into ta.json and a 5th field into stops.json, so 'Amsterdam Frankfurt' route search works (a test URL needs `&r=1`).
- The bahn.de web API answers OPS_BLOCKED from the VPS and v6.db.transport.rest was 503: do not use them. Transitous works (api.transitous.org, MOTIS v6: `/v1/geocode?type=STOP`, `/v6/stoptimes`, `/v6/trip`). Its policy: open source, non-commercial, a User-Agent with contact, and an attribution link to transitous.org/sources (in Credits and README).
- `scripts/abroad_trips.mjs` writes data/abroad-trips.json: {train: [transitousStopId, minutes from the origin departure to the live-trains.json departure at the first German stop]} (109). Feeds abroad may leave out the border stop, so the gap is measured against our own German time. In api/live.js, `abroadNow()` (20 calls/min cap, 45 s cache) adds `run.abroad` {from, pd, late, live, canc}. LiveNow shows it ABOVE the German line, in trip order. Tests: `abroad.mjs` (search and cards), `abroad-live.mjs` (set TRAINS= to trains running now).
- 20 border stations were added to live-stations.json after checking that each id lists long-distance trains. 15 ids did not (e.g. Passau, Flensburg).

## Stops abroad, live and history at both ends (Nov 2026, PR #8)
Owner's test: "amsterdam to dusseldorf", "düsseldorf amsterdam", "Köln Bruxelles", "München Wien", "Basel Frankfurt",
"Berlin Praha" list the trains that run that way; picking one shows status and history at BOTH stops.
- **Stop lists abroad**: `scripts/foreign_stops.mjs` (Transitous, no key; weekly in `.github/workflows/abroad.yml`, Wed
  05:17 UTC; commits only `data/foreign-stops.json`, never shrinking) -> `{trains: {"ICE 121": {at, t, aid, seen, s:
  [[name, arrOffset, depOffset]]}}, stations: {name: [country, transitousStopId]}}`. Offsets are minutes from the
  German anchor stop's planned departure; the anchor is one of the 4 German stops nearest the border (the DELFI
  timetable leaves some border stops out: ICE 221 passes Emmerich without a stop). One board per anchor station and day
  (2 days), one `/v6/trip` per train. Country: inside `lib/germany.json` = German (skipped), else UIC code in a DELFI id
  (`0000084…` NL), else coarse boxes. One spelling per station: `lib/tripStops.cjs` `canonical()` (DB's label from
  stops.json `foreign` when it exists, else a small table: Brussel-Zuid -> Bruxelles Midi ...).
- **Ruled out for stop lists**: gtfs.de `fv_free` is now ~350 kB, 4.5k trips, route names without train numbers
  ("ICE", "IC"), so trains cannot be matched; Transitous `/v6/stoptimes?arriveBy=true` returns arrivals from the day
  before (unreliable); arrivals at a terminus are read from the trip instead.
- **Search**: `scripts/copy-search.mjs` (`mergeAbroad`, via `lib/tripStops.cjs`) puts the stops abroad into each train's
  stop list in `public/search/stops.json` as stations of their own (`abroad`: index -> country, `sources`: countries with
  history), so A -> B by planned time works across the border in both directions and abroad-to-abroad (Amsterdam ->
  Basel). Trains with no stops abroad found keep the old label fallback (field 3/4: board at the first / measure at the
  last German stop). Aliases in `lib/typeahead.ts` (centraal = hbf, zuid = midi, Brüssel, Prag, Wien/Vienna, Lüttich ...).
  Picking a train in a route list adds `?on=&off=` (`lib/trip.ts`) to the card or train page.
- **Live**: `GET /api/live/?train=ICE%20121&on=Amsterdam%20Centraal&off=D%C3%BCsseldorf%20Hbf` (`tripNow()` in
  `api/live.js`): both stops must be stops of that train in stops.json / foreign-stops.json; German stops with a DB id
  (`live-stations.json`) come from DB's plan + fchg, every other stop from the train's Transitous trip (stoptimes at the
  anchor + `/v6/trip`, 2 calls per train, 45 s cache, inside the existing 20 calls/min Transitous ceiling). Window: 3 h
  before the departure at `on` to 90 min after the planned arrival at `off`, today's, yesterday's or tomorrow's run.
  Unknown train/stop: quiet 200 `{ok:false}`. UI: `components/TripEnds.tsx` ("Your trip": both ends, live + history;
  replaces the live box when the address names the stops; `TripOrLive`).
- **History abroad** (`scripts/abroad_history.py` -> `data/abroad-history.json`, same months and rules as `stops.py`:
  measured = not cancelled, planned arrival, delay in the clamp; 15+ share; average; departure figures only where the
  train starts; 20 measured runs or "few trips"): NL Rijden de Treinen services files (CC BY 4.0; only runs that also
  call in Germany, because NS numbers domestic Intercitys like DB's IC 2xxx), BE Infrabel monthly raw files (CC0; a stop
  is a planned wait or an end, passing points like Leuven/Hergenrath are not stops; seconds -> whole minutes toward zero;
  no cancellations in that data, so no cancelled share). Independent recount `tests/data/verify_abroad_history.py` (csv
  + dicts, every cell, 0 differences or no commit), synthetic test `tests/data/test_abroad_history.py`. Runs in the
  monthly job (`monthly.yml`) with the window; the gate allows a source to lag by up to 2 months (the months used are
  in the file).
- **No source (UI says "No history abroad yet for <country>")**: CH: opentransportdata.swiss Ist-Daten archive exists
  (`archive.opentransportdata.swiss/istdaten/YYYY/ist-daten-YYYY-MM.zip`, ~1.3 GB a month of daily CSVs, terms: cite
  opentransportdata.swiss; Sep 2026 not yet published on 2 Nov) but was not built: ~14 GB per window, next step on the
  ROADMAP. AT: data.oebb.at mentions train-run CSVs with delays updated weekly, but the page gives no download links to
  scripts and mobilitaetsdaten.gv.at timed out from Actions; CZ, PL, DK, FR: no per-train, per-stop delay data found
  (SNCF publishes monthly aggregates only).
- Probes of every source: `tests/data/probe_abroad.py` (PR job in `abroad.yml`).

## gtfs.de realtime (free GTFS-RT)
- `https://realtime.gtfs.de/realtime-free.pb` is ONE nationwide file for all public transport: ~32k trip updates (buses ~2/3, regional rail, trams), only ~110 are long-distance on a given evening. 9.5 MB, 3.6 MB gzip (requests asks for gzip by default). The server ignores query filters, so server-side "poll only what we need" is impossible; filter client-side with the static long-distance schedule.
- Static schedule `https://download.gtfs.de/germany/fv_free/latest.zip` (DELFI NeTEx, CC BY 4.0, 30-day window, ~5.3k trips, ICE/IC/EC/ECE/RJ/EN): has route short name, no train numbers, no delays, but DOES list foreign stops (Amsterdam, Basel, Bruxelles). It is the denominator for coverage.
- Finished trips stay in the feed ~1 to 3 hours after arrival, so 30-minute polling is enough for history; per-minute polling is only for measuring retention. A train's delay changes only when it reaches a stop, so live status needs a refresh every 2 to 5 minutes, fetched by our server so visitors never hit the feed.
- Coverage judged late in the evening is misleading (trips appear only once running): judge a COMPLETE service day.

## Collector
- `(collector folder on the server)collect.py` (sqlite `live.db`: polls, stops, trips), analysis `analyze.py`, run as systemd USER service `gp-collect.service` (Restart=on-failure, MemoryMax=400M, linger on). A tmux-hosted copy died when the gateway killed its tmux server: never host long jobs in tmux here. Never start a second copy (doubles polling).
- Footprint measured: ~150 MB RSS, ~0.2% CPU, live.db a few hundred KB per day, ~5 GB/day download at 1 poll/min. Use the site URL, never the user's email, in the User-Agent.
- One-off cron job reports coverage after a complete day; its prompt must name the service, not tmux.

## Coverage result (one complete service day, a Friday; the owner judged one day sufficient)
- The free feed covered 66% of ICE+IC trips (ICE 69%, IC 56%) and 54% of all long-distance trips; EC 1 of 116, ECE/RJ/EN essentially absent. 91% of seen trips carry a final-stop delay; 37% of them were 15+ min late (site headline ~34%, one day only).
- Trips show up only ~10 to 25 min before they start, so no predicted delay hours ahead.
- Verdict: usable but not enough alone. Plan: gtfs.de feed for live ICE/IC status; DB Timetables API for EC/ECE/RJ/EN and the missing third of ICE/IC.

## Which source feeds what (verified in code, 31 Oct 2026; answer "are we using the official DB API?" from this)
- Live status `api/live.js` (also `scripts/live_stations.py`, `(collector folder on the server)dbapi.py`): OFFICIAL DB API Marketplace, Timetables 1.0 Free plan (60 req/min), `https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1`, headers `DB-Client-Id` + `DB-Api-Key` (env `DB_CLIENT_ID`/`DB_API_KEY`). Dormant in production until the Vercel env vars are set.
- Collector `(collector folder on the server)collect.py`: THIRD PARTY gtfs.de GTFS-Realtime (`realtime.gtfs.de/realtime-free.pb`), polled every 60 s, no DB key. Its terms were never checked.
- Rankings/history (`scripts/compute.py`, `$GP_PARQUET/dl.sh`): THIRD-PARTY dataset `piebro/deutsche-bahn-data` on Hugging Face (monthly Parquet, CC BY 4.0 "by Deutsche Bahn"). piebro's own scheduled job calls the official Station Data + Timetables APIs with his credentials; our code uses no DB key for it. Missing hours are listed in his README (e.g. ~102 h in 2026-07). Other fetches: trainline-eu stations CSV (GitHub), Natural Earth outline.
- DB Marketplace terms for a public site on the Free plan were never read (the terms page did not load from the VPS): the owner should read them in the portal before enabling live.

## Other sources (licences unchecked until used)
- Transitous/MOTIS: realtime + cross-border routing, but policy requires open-source non-commercial, ~720 plan requests/day, contact info in User-Agent. Fine for prototyping lookups, not as the feed behind the site.
- DB Timetables API (plan "Free", 60 calls/min; per station, trains only): key from the DB API Marketplace (developers.deutschebahn.com/db-api-marketplace, product Timetables). The owner authorised signing up in his browser session. Observed sign-up: header Register -> /apis/user/register asks for a consumer organisation name (used "German Punctuality"), an IMAGE CAPTCHA, two tick boxes (privacy policy; terms of use "and agree to their validity"), then continues with a DB customer account (bahn.de Kundenkonto) login, probably with an emailed code. Fill only the organisation field; the captcha, the legal tick boxes and the Kundenkonto login are his steps. Park the tab on the form with a recognisable title, hand off through the private viewer, and resume after he says done: subscribe to Free on the Timetables page, create the key, store it 0600 under a local 0600 env file (not in the repo) Steps after login are unverified.
- DB Timetables key DONE (31 Oct 2026): organisation, application and Free-plan subscription exist under the user's bahn.de account ("German Punctuality"). Credentials: `a local 0600 env file (not in the repo)` (0600; DB_CLIENT_ID, DB_API_KEY; never print). Call: `https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1/{station/<pattern> | plan/<eva>/<yyMMdd>/<hh> | fchg/<eva> | rchg/<eva>}` with headers `DB-Client-Id`, `DB-Api-Key`, `Accept: application/xml`, a site-URL User-Agent. Verified: station search 200; plan for Berlin Hbf EVA 8098160 returns ~30 trips (~11 ICE) per hour (EVA 8011160 returns an empty timetable).
- 31 Oct 2026, ~2 h after the key was stored, every call returned 401 "Invalid client id or secret" (a no-credentials control gives the same 401, so the response alone cannot tell a bad secret from a lapsed subscription). Cause: a stale secret (the portal's own Check form said "validation of credential failed"); the Free subscription was still active. Fixed by resetting the secret. Test the key with curl before building on it.
- Portal sign-in needs no password while bahn.de's session cookie is alive in the shared browser: open /apis/user/login?destination=/db-api-marketplace/apis/application, click "Continue with DB customer account" (the privacy/terms boxes are not needed again), then "Continue" on the BahnID info page. The application page is /apis/node/278246 (German Punctuality; two credentials: "Credential for German Punctuality" = the one in the env file, and "gp-live-collector"). Its kebab menu offers Edit / Reset Client ID / Reset Client Secret; the portal's "Check" form verifies a secret without changing anything. Reset Secret shows a confirm page, then a one-time page: capture it in the same call that clicks Reset.
- Marketplace pitfalls: the show-once secret dialog closes by itself, so capture it in the SAME call that clicks Create/Reset (poll innerText and input values every 0.1 s, write a 0600 file, print only lengths); a first click on Save can only focus the button, so check the dialog state before clicking again; resetting a secret invalidates the old one (401 "Invalid client id or secret" from /station/<pattern> means a stale secret). Subscribing to the Free plan accepts the product's terms of service: that was pre-authorised by his request for the key.
- History per country: Rijden de Treinen (NL, per stop since 2019), Infrabel monthly raw files (BE, since 2014, domestic and international), opentransportdata.swiss Ist-Daten (CH), mobilitaetsdaten.gv.at Zugfahrten (AT, depth unchecked), SNCF monthly TGV regularity (FR, aggregates only, ODbL). Needed to measure the real arrival station of cross-border trips and for a Europe league.
- History only starts when our own collector starts; piebro's scrape covers Germany back to Nov 2025.
