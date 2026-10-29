# Progress (resumable)

## Context found
- Window is 11 full months: 2025-11 .. 2026-09 (2025-10 is a partial month and skipped). "Last 12 months" copy must say what the window really is.
- Site reads committed data/*.json at build; the index must therefore be written by scripts/compute.py (needs parquet), not at site build.
- Only 50 trains + 44 lines have detail pages today; long-distance has 2800 train numbers, regional 659 lines.
- Next.js 16.4.3: read node_modules/next/dist/docs before writing code (AGENTS.md).

## Plan
1. [ ] Explore parquet: regional train numbers, weekday, route per unit -> decide index shape
2. [ ] compute.py: write data/search/* (compact index, per-prefix shards if large)
3. [ ] lib + components: SearchBox on home, /search page (client, URL ?q=), result card, share/OG
4. [ ] OG for search results (static: need per-unit OG? decide) + recap card (/recap, OG + tall PNG)
5. [ ] Clean build, typecheck, Playwright tests, DuckDB cross-check, screenshots in after/
6. [ ] SUMMARY.md

## Decisions
- Index: data/search/{index.json, s-<2 digit prefix>.json, n-<type>.json}; compute.py writes them; prebuild copies to public/search/.
  34k units (1732 trains, 645 lines, 31553 regional train numbers), min 20 measured runs, "few runs" warning < 100. 5.2 MB raw / 1.17 MB gz in 113 files, biggest shard 34 KB gz, median 6 KB gz.
- Search UI lives on the home page under TopBar; URL ?q=...&u=<key>; uses window.history + popstate (no useSearchParams).
- Per-result OG impossible statically: result links share home card; ranked units share their /train|/line page (own OG); "Save image" renders a PNG client-side (canvas).
- Recap: /recap/ page + public/og/<month>/recap.png (1200x630) + recap-tall.png (1080x1920), numbers from stats.json `recap` (computed in compute.py). Window is 11 months, so copy says Nov 2025 to Sep 2026.
- Regenerating data also fixed 1 run on RE 3 Saarbruecken page (committed file was 1 run stale vs current pipeline).

## Log
- compute.py search_units/recap_stats done + data regenerated (not yet committed)
- lib/searchCore.ts, lib/searchClient.ts written (not yet type-checked)
- (attempt 2, 17:00) typecheck of searchCore/Client OK. Wrote scripts/copy-search.mjs (prebuild copies data/search s-*/n-* to public/search, gitignored).
- Next: commit lib files; wire TrainSearch into app/page.tsx; recap page + OG; clean build; playwright.
- 17:15 TrainSearch wired into app/page.tsx (above Hero). First build OK (~10 s total incl. og + copy). Served out/ with python http.server :4173. Visual check of ICE 1541 at 390 OK.
- Polished share row (Save as image beside Share on X). Next: recap page + recap PNGs (og.mjs), top-bar link, search metadata, then tests/e2e (scripts/search-e2e.mjs), cross-check, screenshots, SUMMARY.
