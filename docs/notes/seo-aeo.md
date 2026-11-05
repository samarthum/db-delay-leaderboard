# Search and answer-engine optimisation (SEO / AEO)

Added 4 Nov 2026, right after the move to https://zugmonitor.de. Everything is generated from the same data and
dictionary as the pages, so the structured data and the text files cannot disagree with what a visitor reads.

## What is in place
| Piece | Where | Notes |
| --- | --- | --- |
| JSON-LD | `lib/jsonld.ts`, `components/PageLd.tsx` | `pageLd()` = WebPage (or CollectionPage / FAQPage) + BreadcrumbList for every page; `siteLd()` = Organization + WebSite + Dataset, home pages only. Name, description, image and language come from the page's own `Metadata`, so they equal the visible `<title>` / description. `<` is escaped in the script tag. |
| FAQPage | `lib/methodFaq.ts` | The Method page renders from `methodItems()`, and the FAQ structured data and `llms-full.txt` use the same list. Google shows FAQ rich results only for government and health sites now; the markup is for answer engines. |
| Dataset | `siteLd()` | CC BY 4.0, temporal coverage from the data window, variables measured, a JSON distribution (raw `data/stats.json` on GitHub), a ready-made citation string. |
| `llms.txt`, `llms-full.txt` | `lib/llms.ts`, `app/llms.txt/route.ts`, `app/llms-full.txt/route.ts` | llmstxt.org format: headline numbers, page map (EN + DE), top routes / trains / lines, how to cite, the Method Q&A. Says plainly that today's live delay is not in the static text. |
| `robots.txt` | `app/robots.ts` | Search crawlers (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot), user-triggered fetchers (ChatGPT-User, Claude-User, Perplexity-User) and training crawlers (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) named and allowed; `/api/` disallowed for all. To opt out of model training later, move the training bots to `Disallow: /`; search and user fetchers can stay allowed. |
| Titles | `lib/dict/{en,de}/seo.ts`, `routes.ts` | Keyword first, as people search: "ICE 1541 delays: 29.0% of trips 15+ min late" / "ICE 1541 Verspätung: ..."; a regional line carries its route (two lines can share a name, "RE 1"). German reviewed by an independent subagent (`~/.hermes/gp-tests/review/seo-titles*.json` on the VPS). |
| `/more/` | `lib/seo.ts` (`noindex`) | Unlinked, out of the sitemap, now `noindex, follow`. |

Already good before this change (kept): canonical + hreflang pairs with x-default on every page, sitemap with language
alternates (1,578 URLs), Open Graph and Twitter large-image cards, full server-rendered text (no JS needed to read a
number), one `<h1>` per page, `lang` on `<html>`, trailing-slash URLs.

## Checks
- `python3 -I tests/tools/seo-check.py out --all` after `npm run build` (builds without share images are fine for it).
- `node tests/e2e/seo.mjs` against the test server.
- After deploy: fetch `https://zugmonitor.de/llms.txt`, a route page's JSON-LD, and run the Rich Results Test and
  validator.schema.org on one route page and the Method page.

## Not done / owner's steps
- Google Search Console and Bing Webmaster Tools: add the domain (DNS TXT at Porkbun), submit `/sitemap.xml`. These are
  account steps, so they stay the owner's.
- `german-punctuality.vercel.app` (the project's own address, which Vercel never lets you delete) redirects to
  zugmonitor.de with a host-based 308 in `vercel.json`, so only one address is indexed. Search Console's "Change of
  address" tool is for moving a verified site and is not needed: the old host was never a Search Console property.
- No `SearchAction` (sitelinks search box): the search box is client-side with no `?q=` result page worth indexing.
- No per-route `Dataset` or `Place` markup: 1,500 near-identical datasets add noise, not signal.
