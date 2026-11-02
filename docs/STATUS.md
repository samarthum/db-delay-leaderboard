# German Punctuality: status and hand-over

Last updated: 2 November 2026. Start here if you (or an AI coding agent) are picking the project up on a new
machine. Read this, then `docs/ROADMAP.md`, `docs/RULES.md` and, before touching a topic, its file in `docs/notes/`.

## What it is
"How late is your train, really?" A mobile-first site about Deutsche Bahn long-distance delays, in English and German.
History from open data (11 months), live status from DB's own API, cross-border trains via Transitous.

- Live: https://german-punctuality.vercel.app (Vercel project `german-punctuality`, deploys every push to `main`).
- Repo: https://github.com/samarthum/db-delay-leaderboard (public, MIT; data keeps its source licences, see README).
- Stack: Next.js 16 static export (`out/`), React 19, TypeScript; two Vercel Functions in `api/` (`live.js`,
  `scribe-token.js`); data built offline with Python + DuckDB from monthly Parquet files; share images drawn at build
  time with satori + resvg + sharp (`scripts/og.mjs`).
- Owner: Samarth. He reviews outcomes, not copy: expert reviewers (AI subagents or humans) review copy, German and
  legal text. He gives the go to publish (see `docs/RULES.md`).

## What is live (all on `main`)
| Area | What the visitor gets | Code |
| --- | --- | --- |
| Home | Built around "my train today" (redesign 1 Nov 2026, `docs/notes/home-redesign-log.md`): headline, one-line lead, the search box, then "Your trains" (starred) and "Looked up lately" with today's live departure and arrival (named stops), a starred route's next train, the usual delay read from current data; then the network average and the most delayed routes | `components/pages/HomePage.tsx`, `YourTrains.tsx` |
| Search | Full-screen sheet on phones (starred trains and recent pages first); trains (number), routes ("8:14 Köln to Berlin" offers the train closest to that time first, then the route), stations (with "Where are you going from X?"); lands on the page when one exists; suggestion figures labelled "average delay" | `components/search/*`, `lib/routeSearch.ts`, `lib/searchCore.ts` |
| Route pages (685) | Average delay, % 15+ and DB's 6-min rule, trains on the route with each train's average, live "next trains" board, share picture; opened with a time (`?t=08:14`) the closest trains come first with the nearest marked and its live state | `components/pages/RoutePage.tsx`, `scripts/routes.py` |
| Train pages (50) + search result card (every other train) | Live box first: departure at the first and arrival at the last station with live times (delay, platform change, cancellation; "no delay reported" in grey, never "on time"), departure abroad for trains from abroad, where live times stop for trains ending abroad, "next run" outside the window; card says when a train has no live times or the feed is down. Then "How late it has run" (11 months, 12 after the October refresh), "Sundays, like today" (card), "latest month" (train page; card once the monthly refresh has written search field 17). "Getting on or off at another stop?": the train's own stops, pick on/off, lands on that route at the train's time. "The last 7 days" under it on both (every long-distance train, not only the 50): one mark per day at departure (first German stop) and arrival (last German stop), cancelled as ×, no run / incomplete days hollow, one sentence (arrival average, days 15+ late, cancellations), the as-of day; refreshed daily (below). Save star on both ("Save to home" in words on the card) | `UnitPage.tsx`, `search/SearchResult.tsx`, `LiveNow.tsx`, `LastWeek.tsx`, `scripts/last7.py` |
| Cross-border trains (Nov 2026, PR #8) | Stops abroad on both sides of the border in route search ("Amsterdam to Düsseldorf", "Köln Bruxelles", "Amsterdam to Basel"; English/German/local spellings); picking a train opens its card/page with "Your trip": both chosen stops with today's live status (DB in Germany, Transitous abroad) and the train's usual delay at each stop (DB data in Germany, Rijden de Treinen in the Netherlands, Infrabel in Belgium, "No history abroad yet for <country>" elsewhere) | `scripts/foreign_stops.mjs`, `scripts/abroad_history.py`, `lib/tripStops.cjs`, `components/TripEnds.tsx`, `api/live.js` `tripNow()` |
| Change trains | Pick arriving train, station, next train: how often that change worked; live: minutes to change by DB's forecast and history for days the arriving train was similarly late | `ChangeTrains.tsx`, `lib/changeTrains.ts`, `lib/liveChange.ts`, `scripts/connections.py` |
| Rankings / Network / Recap / Method | Route and train rankings (avg delay or most often late), network map + month chart, yearly recap, method + credits | `components/pages/*` |
| Compensation | Plain-language page: 3-zone ruler, calculator, claim in 3 steps, what counts, 20/60/100-min ladder, can DB say no, 1-in-17 dot grid, legal fine print in folds | `CompensationPage.tsx`, `CompCalc.tsx`, `Compensation.module.css` |
| Share pictures | Portrait 1080x1350 per route/train/line (recap 1080x1920); wide 1200x630 only as og:image | `scripts/og.mjs` |

Phone navigation: four tabs (Search, Change trains, Rankings, Network); top bar on every page has the Deutsch/English switch and a "Menu" dropdown (Compensation, Recap, Method; `PagesMenu.tsx`), also in the footer link row (not on Change trains). Desktop header lists all.

Brand: the header mark is a flustered little train (ink only); the same train, hand-drawn at 16 px, is the favicon; the line train is also on every share card and the Android home-screen icon (web manifest per language). Sources and how to redraw the icons: `docs/notes/product-and-ui.md` (Brand mark).

Switched OFF but built: voice search (ElevenLabs Scribe; `VOICE_ENABLED=1` turns it on; owner found it buggy).
The live-feed collector service (`docs/notes/live-and-international.md`) is stopped.

## Data at a glance (as committed)
- History window: Nov 2025 - Sep 2026 (`data/stats.json`), source piebro/deutsche-bahn-data (CC BY 4.0), German
  stations only. 685 route pages (76 ranked), 50 train pages, 44 line pages, 1,574 sitemap URLs.
- Live lookups: 897 trains (`data/live-trains.json`), 96 stations (`data/live-stations.json`).
- Trains from abroad: 134 real origins (`data/foreign-origins.json`), 109 matched in Transitous
  (`data/abroad-trips.json`); refreshed weekly (below).
- Stops abroad: `data/foreign-stops.json` (Transitous; weekly, GitHub Actions `abroad.yml`). History at stops abroad:
  `data/abroad-history.json` (NL Rijden de Treinen CC BY 4.0, BE Infrabel CC0; same window and rules as the German
  stops; recomputed by the monthly job, recounted independently).

## Environment variables (Vercel, Production only; never commit values)
| Name | Purpose |
| --- | --- |
| `LIVE_ENABLED=1`, `DB_CLIENT_ID`, `DB_API_KEY` | DB Timetables API (DB API Marketplace, free plan, 60 calls/min) for all live features. Without them `/api/live/` answers `{ok:false,error:"disabled"}` and pages show no live parts. |
| `ELEVENLABS_API_KEY`, `VOICE_ENABLED` | Voice search (off). |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL if a custom domain is added (build-time). |

For local live testing put the same names in `.env.local` (git-ignored) and start the test server with
`node --env-file=.env.local tests/tools/serve.mjs`.

## Run it on a new machine
```bash
git clone https://github.com/samarthum/db-delay-leaderboard && cd db-delay-leaderboard
npm ci                     # Node >= 20.9 (Playwright needs >= 20)
npx playwright install chromium
npm run build              # prebuild draws share cards (cold ~8 min, cached afterwards) and copies search data
node tests/tools/serve.mjs &                  # serves out/ on :4599
node tests/e2e/pages.mjs                      # main phone suite (~125 checks)
```
Data jobs (only when changing data) need Python 3 + `pip install -r scripts/requirements.txt` and the monthly Parquet
files: download them as in `docs/notes/data-pipeline.md` into a folder and pass `--data-dir` (or set `GP_PARQUET` for
the checks in `tests/data/`). They need ~1.5-2.5 GB RAM; never overwrite committed data with a fresh compute
wholesale (see RULES).

## Tests (in `tests/`)
| File | What | Needs |
| --- | --- | --- |
| `e2e/pages.mjs` | Phone + desktop checks of every page type, search sheet, sticky title, rankings, compensation calculator, DE | test server |
| `e2e/home-today.mjs` | Home, search card (incl. the latest-month line, shard rewritten in the test), route-with-time and every live state against MOCKED `/api/live/` answers (`tests/fixtures/live.mjs`, same shape as `api/live.js`; time-of-day checks on a fixed clock); no keys needed | test server |
| `tools/home-shots.mjs` | Screenshots of home/search/card/route/train states at 390/320/1280 with mocked live, for design reviews (`OUT=dir`) | test server |
| `e2e/next-run.mjs`, `e2e/abroad.mjs` | Next-run line; trains from abroad (cards, route search) | test server with live keys (`node --env-file=.env.local tests/tools/serve.mjs`) |
| `e2e/live-now.mjs` | Live box + save/Your trains. Set `SOON=` and `IDLE=` train slugs for the current Berlin time | live keys |
| `e2e/cx-live.mjs` | Change trains live, picks changes due in 10-120 min | live keys |
| `e2e/cross-border.mjs` | The owner's six cross-border searches typed into the box (+ one in German), at 390 and 320 px: a list, then "Your trip" with both stops, live at both ends (MOCKED trip answers) and history at both ends; other live states; "no data abroad" | test server |
| `unit/route-search.mjs` | Route search across the border on a synthetic index: aliases (Düsseldorf/Dusseldorf, Brüssel, Prag, Vienna, Cologne, Zurich), direction, foreign-to-German, German-to-foreign, abroad-to-abroad, label fallback, no-history flag | none |
| `data/test_abroad_history.py`, `data/verify_abroad_history.py` | History abroad on synthetic RdT/Infrabel files; independent recount of every cell from the raw files | Python deps / `--cache` |
| `e2e/abroad-live.mjs` | Departure abroad in the live box (`TRAINS="ICE 74,RJ 88"` running now) | live keys |
| `tools/crawl-overflow.mjs` | Every sitemap page at 390 px: overflow + console errors | test server |
| `data/verify_bins.py`, `data/verify_train_avg.py` | Independent recompute from raw Parquet (different query shape) | `GP_PARQUET` |
| `data/test_last7.py` | `scripts/last7.py` + `verify_last7.py` against a simulated raw-data tree (`data/last7_fixture.py`: 6-hourly fetches, DST change, a missed fetch, a lost plan hour, cancellations, replacement train) | Python deps only |
| `data/verify_last7.py` | Independent recompute of `data/last7.json` from the raw files (regex + dicts; the daily job runs it) | raw files (`--raw`) |
| `data/test_monthly.py` | The monthly refresh end to end on synthetic months (`data/monthly_fixture.py`): plan (incl. `--recompute`), pipeline, gate (incl. `--expect recompute`), verifiers, planted errors caught, the last-stop rule against a plain-Python third implementation (38 checks, ~2 min) | Python deps only |
| `data/verify_monthly.py` | Independent recompute of every history file family from the Parquet (the monthly job runs it) | `--parquet DIR` |
| `data/compare_last_stop.py` | Before/after of the last-stop rule: both rules from the Parquet (headline, train moves, top movers with raw stop rows) and which file figures changed (PR dry run and recompute runs) | `--parquet DIR --old DIR` |
| `data/compare_routes.py` | Route fix on one window: committed routes.json vs a re-run (PR-only step) | two routes.json |
| `data/compare_monthly.py` | `last7.py`'s per-run logic on a September 2026 week of raw files vs piebro's monthly file (the 11-month history's source): per-ride first/last-stop delays must agree 98%+ exactly (PR-only job in `last7.yml`) | Hugging Face (Actions), or `--raw` + `--monthly` |
| `e2e/skew.mjs` | Version skew: a tab on build A taps links, search suggestions, tabs, menu, recent list after `out/` is swapped for build B; a hung soft navigation ends as a full load. Builds twice (~2-3 min), leaves `out/` as a test build | none (own server on :4612) |
| `e2e/last7.mjs` | "The last 7 days" (57 checks) on card + train page in every data state against MOCKED `/last7/` (`tests/fixtures/last7.mjs`) | test server |
| `tools/last7-shots.mjs` | Screenshots of that block (390 / 320 DE / 1280, full / gaps / cancel ...) for reviews (`OUT=dir`) | test server |
| `tools/secretscan.py` | Every blob in history for secrets; `--known .env.local` checks exact values | - |
Also `npx tsc --noEmit` and `node scripts/check-dict.mjs` (EN/DE key + placeholder parity). Use `BASE=` to point
e2e at production; `CHROMIUM=` to pick a browser binary.

## Automation that runs outside the repo
- Weekly refresh (owner's server, systemd user timer `gp-refresh.timer`, Tuesday 04:30 UTC): `docs/ops/refresh.sh`
  clones the repo into its own folder, runs `scripts/foreign_origins.mjs` and `scripts/abroad_trips.mjs`, and pushes
  to `main` only if just those two files changed and neither shrank. To set it up elsewhere: copy `docs/ops/refresh.sh`
  to `~/gp-refresh/`, put `DB_CLIENT_ID=` / `DB_API_KEY=` lines in `~/gp-refresh/db.env` (chmod 600), copy the two
  unit files from `docs/ops/` to `~/.config/systemd/user/`, then `systemctl --user enable --now gp-refresh.timer`.
  Needs node >= 20 and git push rights for that user. Log: `~/gp-refresh/last.log`.
- Daily "last 7 days" (GitHub Actions, `.github/workflows/last7.yml`, 10:41 UTC, catch-up 16:23 UTC, also
  `workflow_dispatch`; no keys): `scripts/last7.py` downloads ~10 day folders of piebro's raw files from Hugging Face,
  writes `data/last7.json`, `tests/data/verify_last7.py` re-checks a sample, `last7.py --check` gates coverage/size/date,
  and only if `data/last7.json` is the only change it commits and pushes to `main` (Vercel deploys). Why that hour:
  `docs/notes/data-pipeline.md` ("Last 7 days"). On pull requests touching the job it runs as a dry run (artifact, no
  commit) plus a PR-only job proving the 7-day numbers are measured like the monthly history (`compare_monthly.py`). If it fails, the site keeps the last good file and the block says "Not updated since ..." after 3 days.
- Monthly history refresh (GitHub Actions, `.github/workflows/monthly.yml`, daily 07:37 UTC on the 2nd-10th, also
  `workflow_dispatch`; no keys): `scripts/monthly.py plan` acts only when the last finished month's Parquet is
  published and `data/stats.json` does not cover it; then it downloads the window (~4.5 GB), runs compute -> stops ->
  routes -> connections -> compensation, re-checks every file family against the Parquet (`tests/data/verify_monthly.py`,
  `verify_bins.py`, `check_headline.py`), runs the sanity gate (`monthly.py gate`: window +1 month, row counts, no family
  shrinking, no field vanishing, sizes) and commits only the history data files to `main` as github-actions[bot]. On
  pull requests touching the pipeline: dry run with a summary and artifact. `gh workflow run monthly.yml -f
  recompute=true` reruns the COMMITTED window after a rule change (gate: same window and runs, figures move a little;
  before/after report `tests/data/compare_last_stop.py` in the job summary). Stop order everywhere: planned time, then
  stop number; a station listed twice at the same planned times counts once (Nov 2026; data-pipeline notes). Replaced `refresh.yml` (Nov 2026). Rules:
  `docs/notes/data-pipeline.md` ("Monthly refresh"); log: `docs/notes/monthly-log.md`.
- Stops abroad weekly (GitHub Actions, `.github/workflows/abroad.yml`, Wednesday 05:17 UTC, also `workflow_dispatch`;
  no keys): `scripts/foreign_stops.mjs` reads Transitous (light use, ~1,000 calls 1.5 s apart) and commits only
  `data/foreign-stops.json` to `main` when it is the only change and did not shrink. On pull requests touching it: a
  trial run committed to the PR branch (skipped when the trial data is newer than the script), the history abroad on
  the committed window with its independent recount and an awk hand check of three cells. Source probes (`tests/data/probe_abroad.py`) run by hand.
- Vercel builds on push (~2-10 min; ~10 min when all share cards redraw).

## Known gaps and caveats
- Old tabs after a deploy: `/version.txt` + `lib/deploy.ts` turn taps into full page loads once a newer build is live, and any soft navigation stuck for 8 s into a full load (`docs/notes/release.md`, "Old tabs after a deploy"). The production trigger of the Nov 2026 dead tap was not reproduced (local Next falls back by itself).
- About half of searchable long-distance trains have live times; irregular trains and 15 border stations whose DB id
  lists no long-distance trains (Passau, Flensburg, Mönchengladbach...) have none.
- ~135 trains from abroad still lack their real origin (not running on the days the lookup ran, or renamed numbers);
  the weekly job fills them in over time.
- History abroad exists for the Netherlands and Belgium only (`docs/notes/live-and-international.md`); elsewhere stops
  abroad say "No history abroad yet for <country>". A German stop where the train starts has no history figure (the
  German data measures arrivals). Trains whose stops abroad Transitous did not list keep the old behaviour (first/last
  German stop).
- DB's feed sometimes lacks an arrival time; the site then shows no line rather than a guess. Late/cancelled states
  of the live box were tested with a mock, rarely seen with real data.
- The Free-plan terms of the DB API Marketplace for a public site were never read in full.
- Transitous may only be used while the site is open source and non-commercial (see RULES).
- Route lists hide 241 rows that run the other way (data bug, fixed in `scripts/routes.py` in Nov 2026: direction by
  planned time). The committed `data/routes.json` still has them until the first monthly refresh lands; the
  `runsThisWay` filter goes after that (ROADMAP).
- "The last 7 days" was built and verified against a simulated raw-data tree only: Hugging Face is blocked from the
  build sandbox. The first real numbers come from the workflow (PR dry run, then the daily job). Not yet known from
  real data: how far DB's change lists reach back (assumed ~6 h) and the raw file sizes. Per-month history per train
  exists only for the 50 train pages; the card has 11-month, per-weekday and last-7-days figures (ROADMAP).
- First real dry run (PR #3, 1 Nov 2026, Actions run 41312632863): piebro's fetch runs land about 01:00, 10:00 and
  15:00-21:00 Berlin, often more than 7 h apart, so 143 of the window's ~178 hours counted as missing (most runs
  "?"). Its one verifier difference (a day with no first stop written as "the usual first stop") is fixed; whether
  the 7 h gap rule is too strict for the real cadence is open (`docs/notes/last7-log.md`).
- Live states on the redesigned home/card were built and tested against mocked feed answers only (no keys in the build
  environment); check them on a real phone after deploy.
- `/more/` and `/de/mehr/` still exist but are unlinked (owner to decide: delete or redirect).
