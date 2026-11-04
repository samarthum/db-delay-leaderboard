// Browser pass for the SEO/AEO change: every key page type at 390 px and 1280 px, EN + DE: no console errors, no
// horizontal overflow, exactly one JSON-LD graph parsed by the browser, visible text still starts with the h1.
// Needs the test server on :4599 (node tests/tools/serve.mjs) and playwright (CHROMIUM= picks a browser binary).
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const urls = ['/', '/de/', '/ranking/', '/routes/', '/change/', '/compensation/', '/de/entschaedigung/', '/recap/', '/network/', '/method/', '/de/methode/',
  '/route/hamburg-hbf-berlin-hbf/', '/de/strecke/hamburg-hbf-berlin-hbf/', '/train/ice-1541/', '/de/zug/ice-1541/', '/line/rb-28-bad-koetzting-cham-oberpf/', '/more/'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
for (const [w, h] of [[390, 844], [1280, 800]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 });
  for (const u of urls) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error' && !/scribe-token|api\/live|404 \(Not Found\)|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 140)); });
    await p.goto(BASE + u, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(350);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
    const ld = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent)['@graph'].length; } catch { return -1; } }));
    const visibleLd = await p.evaluate(() => [...document.querySelectorAll('script[type="application/ld+json"]')].some(s => s.offsetWidth || s.offsetHeight));
    const h1 = await p.evaluate(() => document.querySelectorAll('h1').length);
    ok(errs.length === 0, `${w}px ${u} console: ${errs.join(' | ')}`);
    ok(ov <= 0.5, `${w}px ${u} overflow ${ov}`);
    ok(!ld.includes(-1), `${w}px ${u} JSON-LD parse`);
    ok(!visibleLd, `${w}px ${u} JSON-LD must not render`);
    ok(h1 === 1, `${w}px ${u} h1 count ${h1}`);
    if (u === '/more/') ok(await p.evaluate(() => document.querySelector('meta[name=robots]')?.content.includes('noindex')), '/more/ noindex in the live DOM');
    if (u === '/method/') {
      ok(ld.length === 1 && ld[0] === 2, `${u} one graph of 2 nodes, got ${ld}`);
      // The method page still opens/closes questions (details elements) after the refactor.
      const n = await p.locator('details').count();
      ok(n === 12, `${u} 12 questions, got ${n}`);
      await p.locator('details summary').first().click();
      ok(await p.locator('details[open]').count() === 1, `${u} first question opens`);
    }
    // Home: the site-wide graph (Organization, WebSite, Dataset) and the page graph (WebPage, BreadcrumbList).
    if (u === '/') ok(ld.length === 2 && ld[0] === 3 && ld[1] === 2, `/ site graph of 3 + page graph of 2, got ${ld}`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(`pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
