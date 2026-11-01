# German Punctuality: status and hand-over

Last updated: 1 November 2026. Start here if you (or an AI coding agent) are picking the project up on a new
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
| Train pages (50) + search result card (every other train) | Live box first: departure at the first and arrival at the last station with live times (delay, platform change, cancellation; "no delay reported" in grey, never "on time"), departure abroad for trains from abroad, where live times stop for trains ending abroad, "next run" outside the window; card says when a train has no live times or the feed is down. Then "How late it has run" (11 months), "Sundays, like today" (card), "latest month" (train page). "Getting on or off at another stop?": the train's own stops, pick on/off, lands on that route at the train's time. "The last 7 days" under it on both (every long-distance train, not only the 50): one mark per day at departure (first German stop) and arrival (last German stop), cancelled as ×, no run / incomplete days hollow, one sentence (arrival average, days 15+ late, cancellations), the as-of day; refreshed daily (below). Save star on both ("Save to home" in words on the card) | `UnitPage.tsx`, `search/SearchResult.tsx`, `LiveNow.tsx`, `LastWeek.tsx`, `scripts/last7.py` |
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
| `e2e/home-today.mjs` | Home, search card, route-with-time and every live state against MOCKED `/api/live/` answers (`tests/fixtures/live.mjs`, same shape as `api/live.js`); no keys needed | test server |
| `tools/home-shots.mjs` | Screenshots of home/search/card/route/train states at 390/320/1280 with mocked live, for design reviews (`OUT=dir`) | test server |
| `e2e/next-run.mjs`, `e2e/abroad.mjs` | Next-run line; trains from abroad (cards, route search) | test server with live keys (`node --env-file=.env.local tests/tools/serve.mjs`) |
| `e2e/live-now.mjs` | Live box + save/Your trains. Set `SOON=` and `IDLE=` train slugs for the current Berlin time | live keys |
| `e2e/cx-live.mjs` | Change trains live, picks changes due in 10-120 min | live keys |
| `e2e/abroad-live.mjs` | Departure abroad in the live box (`TRAINS="ICE 74,RJ 88"` running now) | live keys |
| `tools/crawl-overflow.mjs` | Every sitemap page at 390 px: overflow + console errors | test server |
| `data/verify_bins.py`, `data/verify_train_avg.py` | Independent recompute from raw Parquet (different query shape) | `GP_PARQUET` |
| `data/test_last7.py` | `scripts/last7.py` + `verify_last7.py` against a simulated raw-data tree (`data/last7_fixture.py`: 6-hourly fetches, DST change, a missed fetch, a lost plan hour, cancellations, replacement train) | Python deps only |
| `data/verify_last7.py` | Independent recompute of `data/last7.json` from the raw files (regex + dicts; the daily job runs it) | raw files (`--raw`) |
| `data/compare_monthly.py` | `last7.py`'s per-run logic on a September 2026 week of raw files vs piebro's monthly file (the 11-month history's source): per-ride first/last-stop delays must agree 98%+ exactly (PR-only job in `last7.yml`) | Hugging Face (Actions), or `--raw` + `--monthly` |
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
- Monthly stats refresh (`.github/workflows/refresh.yml`, Mondays 05:17 UTC) checks for a new monthly Parquet file.
- Vercel builds on push (~2-10 min; ~10 min when all share cards redraw).

## Known gaps and caveats
- About half of searchable long-distance trains have live times; irregular trains and 15 border stations whose DB id
  lists no long-distance trains (Passau, Flensburg, Mönchengladbach...) have none.
- ~135 trains from abroad still lack their real origin (not running on the days the lookup ran, or renamed numbers);
  the weekly job fills them in over time.
- History abroad is not measured: delays start at the first German stop (pages say so).
- DB's feed sometimes lacks an arrival time; the site then shows no line rather than a guess. Late/cancelled states
  of the live box were tested with a mock, rarely seen with real data.
- The Free-plan terms of the DB API Marketplace for a public site were never read in full.
- Transitous may only be used while the site is open source and non-commercial (see RULES).
- Route lists hide 241 rows that run the other way (data bug in `scripts/routes.py`, ROADMAP).
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
