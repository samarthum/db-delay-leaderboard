# German Punctuality: train search + yearly recap card (build, launch tomorrow)

Repo: /workspace/db-delay-leaderboard (Next.js 16 static export, main at c89987d, auto-deploys to https://german-punctuality.vercel.app from main). Pipeline: scripts/compute.py (DuckDB over piebro/deutsche-bahn-data monthly parquet, CC BY 4.0; local files in /workspace/db-delays/ and /tmp/db-delay-parquet; venv /workspace/db-delays/.venv; use --data-dir to avoid re-downloading). Context on current scope (long-distance per train number, regional per line, night trains excluded): /workspace/gp-pass3/SUMMARY.md and PIPELINE.md, repo README.

## Build
1. Search by train number. A visitor types a train number they're travelling on (e.g. "ICE 1541", "1541", "RE 19", "RB 31", a regional train number) and immediately sees that train's historical stats from the last 12 months: average delay, how often 15+ min late, cancelled %, which weekdays are worst, typical route, worst trip, and a link to its full page if one exists. Cover every long-distance train number and every regional line/train with a sensible minimum of runs (state the threshold on the result if there are too few runs). Handle no match, ambiguous matches (same number, several lines) and typos gracefully. Search box prominent on the home page (top, mobile-first) and the result should be shareable (URL with the query; share card/OG that works for X). Keep it static: build-time compact index searched in the browser, no server. Keep the index small (measure; split by prefix and lazy-load if large) and the build fast.
2. Yearly recap card for X: a shareable "German trains, last 12 months" image/page with 3-4 striking real numbers from the data (1200x630 OG and a tall phone-friendly version). Plain copy.
Keep: light mode only, mobile-first, the super simple plain copy style (no AI slop, no hype), attribution, SITE_URL handling. Every number must come from the pipeline data; invent nothing.

## Verify your own work (mandatory, don't skip)
- Clean `npm ci && npm run build` and typecheck pass.
- Actually run the built app (serve out/ locally) and test it in a real browser with Playwright: search at least ICE 1541, 1541, RE 19, RB 31, a regional train number, a nonexistent number, a typo; check results render, numbers are right, URLs share, back/forward work, no console errors, no overflow at 390x844, and desktop 1440x900 looks right. Fix whatever fails and retest.
- Cross-check 3 search results against an independent DuckDB query on the parquet files.
- Save screenshots to /workspace/gp-search/after/ (mobile + desktop: home with search, 3 results, no-match, recap card PNGs).

## Rules
- Git: small logical commits on main locally. Do NOT push. Never force, rebase or amend.
- No Opus helper agents. At most 1-2 Sonnet helpers, only if needed, and never in the background.
- Resumable: progress in /workspace/gp-search/progress.md. Write files incrementally.
- Last act: /workspace/gp-search/SUMMARY.md: what changed for visitors, test results (what you ran and what passed), cross-check results, index size and build time, commits, anything open.
