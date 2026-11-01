<!-- Working notes carried over from the agent's project notes; paths point into this repo. -->
# Release checklist (publish to production)

Publishing = fast-forwarding `main` (Vercel deploys on push). Ask the user first; a rollback is a force-push of the previous commit and also needs his word.

1. Branch is committed (`git status --short` empty), typecheck, `check-dict`, full build, and the Playwright e2e (38 tests) pass; `scripts/search_flow.mjs` passes (14 flows); checked at 390 px for overflow and console errors. A build plus both test suites can exceed the 600 s foreground cap: run it as one background command with notify.
2. `git fetch origin && git merge-base --is-ancestor origin/main <branch>` must print OK; then `git push origin <branch>:main` (never force). Also push the branch.
3. Poll a marker that only the new build has until it matches (about 2-10 minutes), not the home page: a new URL returning 200, or for a changed file its exact byte size. The GitHub commit status is shared with the branch preview of the same SHA, so it can say `success` before `main` serves the new build, and Vercel can say "Deployment has completed" while the edge still serves the old file for a few minutes.
4. Scale the production check to the change. Copy/page-only release: the marker poll plus one request each for the new page, its DE twin and one page that links to it (status 200 and a string only the new build has); local suites already proved the code. Release that touches data files, share cards, routing or search: run `scripts/prod_check.py` (every route page, share image, ranking, search data and sitemap; verifies og:image, canonical, hreflang) and one browser pass on production URLs (search -> page agreement, picture button). When explaining why anything is checked on production at all, say so plainly: only the deploy itself can differ from the local build.
5. Report what was verified on production and what was not (real phone share sheet, Google result look, social card rendering, desktop layout).

## When the gp/ test suites are gone (scratch pruned or cleaned)
- Minimum green bar that was accepted for a small release: `npx tsc --noEmit`, `node scripts/check-dict.mjs`, `npm run build` (background, ~4 min warm cache; read `BUILD_EXIT=` from its log), then a 390 px overflow crawl of every URL in `out/sitemap.xml` (EN + DE, 1,574 pages): small Node script with a static server over `out/` (trailing-slash dirs -> index.html), fresh browser context every 25 pages, overflow = `scrollWidth - visualViewport.width`. About 10 min; run it in the background and poll its output file. State in the report that the full suites were not run and why.
- Foreground tool calls cannot use `nohup`/`setsid`; use the terminal's own background mode. 
- Dirty tree before publishing: read `git diff`; if it finishes the work of the last commit, commit it; if half-done, stash and say so.

## Production sweeps are rate-limited
- Vercel's bot protection challenged the VPS IP (403, `x-vercel-mitigated: challenge`, "Failed to verify your browser") on every page, for curl and real Chromium alike, after a day of repeated full sweeps (prod_check over ~3,400 URLs plus ~10 browser suites, several times). Run the full sweep once per release, not once per fix; test fixes against the local server.
- For the deploy marker, poll the direct URL with a browser User-Agent every ~45 s in a background process with notify, and fall back to the outside reader only on 403 (the block can lift on its own). When blocked, do not hammer it. Check through an outside reader: `https://r.jina.ai/https://german-punctuality.vercel.app/<path>` returns the real page and data files. Report "site fine, VPS blocked" and ask the owner to open the page on his phone if a visual check is needed.

## Report hygiene
- Never state the result of a visual check that returned no answer (an image check sometimes returns only the image). Re-measure in the browser, and if a claim was made before it was verified, say so.
- Lead with what is live vs on a branch vs preview-only; give one decision for the user.
