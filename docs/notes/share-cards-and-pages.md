<!-- Working notes carried over from the agent's project notes; paths point into this repo. -->
# Share cards and new page types

The user wants share cards that are "stunning images" people post, and a mobile-first, uncluttered UI. Judge every card and page with an image check at phone size and iterate; be strict about clutter.

## Cards (scripts/og.mjs, satori + resvg)
- Route cards: wide 1200x630 (link preview) and `-portrait` 1080x1350 (to share), per route and language, under `public/og/routes/<month>/[de/]`; plus ranking cards. Same dark board look: split-flap % tiles, amber accent, late-share colour scale.
- satori layout: put padding on an INNER box and keep the sized outer box padding-free (same shape as `frame()`); otherwise children lay out at full width and run off the right edge.
- Barlow Condensed has no arrow glyph: draw an svg arrow. Compute the name font size from the longer station name so each name stays on one line (`nameSize`), and use short card names (`cardName`).
- Variants for thin data: a route with no stops in between has no curve; fill the space with a best/worst train panel instead of leaving a hole.
- Bottom-edge guard in `render()`: fail the build when any pixel in the last 14 px is not background. Overflowing satori content still renders and looks fine in a thumbnail while the footer is cut off. Re-run the guard after any text change: German strings are longer.
- Image budget: every route adds 4 images (wide + portrait, EN + DE). 732 images build in ~50 s and were ~62 MB; Vercel Hobby has no hard output cap but long builds and 100k+ files hurt, and 685 routes would be ~2,700 images (~250 MB raw). Compress route cards with sharp palette PNG (`png({palette: true, quality: 90, colours: 128, dither: 0.6})`, about 30% of the size, no visible banding on the flat dark cards; vision-check one before trusting it). `sharp` is a pinned devDependency; og.mjs falls back to uncompressed PNGs if it is missing.
- Check the cap before widening the page set: images per route x routes x file size, and the build time on the 2 vCPU box.

## Pages
- A page per route needs: own URL in both trees (`/route/<slug>/`, `/de/strecke/<slug>/`), per-page OG image, canonical + hreflang, sitemap entries, links from search and the home/footer, reverse-direction link.
- A shared link of a query-string result previews as the generic home page; give anything shareable its own static URL.
- Orphaned last words in long German sentences: `text-wrap: pretty`; measure the real last line in the browser (Range rects) instead of trusting a screenshot read.
- "Share the picture" button: fetch the PNG, `navigator.canShare({files})` -> `navigator.share`, else download. Test download path in headless Chromium; the real share sheet needs a phone.
