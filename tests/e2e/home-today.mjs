// "My train today" home + live states, against MOCKED /api/live/ answers (tests/fixtures/live.mjs; no DB keys needed).
//   node tests/tools/serve.mjs &   then   node tests/e2e/home-today.mjs
import { chromium } from 'playwright';
import { mockLive } from '../fixtures/live.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

async function open(url, { w = 390, h = 844, live = 'disabled', store = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 900, hasTouch: w < 900, locale: 'en-GB' });
  if (store) await ctx.addInitScript((s) => localStorage.setItem('gp-saved-v1', JSON.stringify(s)), store);
  await mockLive(ctx, live);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/scribe-token/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  p.ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
  return p;
}
const close = (p) => p.context().close();
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => '');

try {
  // Card: each live state says what DB reports, never "on time".
  const card = '/?q=ICE%20224';
  { const p = await open(card, { live: 'late' }); const box = await text(p, '.livenow');
    ok(/Departure/.test(box) && /12 min late/.test(box) && /Arrival/.test(box) && /9 min late/.test(box), 'card late: both ends ' + box.replace(/\s+/g, ' '));
    ok(/How late it has run/.test(await text(p, 'main')), 'card: history labelled');
    ok(await p.locator('main .savebtn').count() === 1, 'card: save star');
    ok(p.ov <= 0.5 && p.errs.length === 0, 'card late: no overflow, clean console ' + p.errs.join('|')); await close(p); }
  { const p = await open(card, { live: 'onTime' }); const box = await text(p, '.livenow');
    ok(/No delay reported/.test(box) && !/on time/i.test(box), 'card onTime: no delay reported, never on time');
    const c = await p.locator('.livenow .ln-status').first().evaluate((e) => getComputedStyle(e, '::before').backgroundColor);
    ok(!/29, 122, 73|127, 154, 28/.test(c), 'card onTime: square is not green ' + c); await close(p); }
  { const p = await open(card, { live: 'cancelled' }); const box = await text(p, '.livenow');
    ok(/Cancelled/.test(box) && /What you can claim/.test(box) && !/Platform/.test(box), 'card cancelled: next steps, no platform'); await close(p); }
  { const p = await open(card, { live: 'unknown' }); ok(/No live times for this train/.test(await text(p, 'main')), 'card unknown: says no live times'); await close(p); }
  { const p = await open(card, { live: 'busy' }); ok(/not available right now/.test(await text(p, 'main')), 'card busy: says unavailable'); await close(p); }
  { const p = await open(card, { live: 'disabled' }); ok(await p.locator('.livenow, .ln-next').count() === 0, 'card disabled: no live block'); await close(p); }
  { const p = await open(card, { live: 'next' }); ok(/Next: today/.test(await text(p, '.ln-next')), 'card next: next run line'); await close(p); }
  { const p = await open(card, { live: 'platform' }); ok(/Platform changed: now 12/.test(await text(p, '.livenow')), 'card platform change line'); await close(p); }
  { const p = await open(card, { live: 'late' }); ok(/Ends in Amsterdam Centraal/.test(await text(p, 'main')) && /goes on to Amsterdam/.test(await text(p, '.livenow')), 'card: train ending abroad explained'); await close(p); }

  // Home: box on the first screen; a starred train shows both ends, labelled.
  const store = { en: [{ kind: 'train', href: '/train/ice-1541/', title: 'ICE 1541', sub: 'Köln Hbf → Berlin Südkreuz', avg: 11.2, live: 'ICE 1541' }], de: [] };
  for (const [w, h] of [[390, 844], [320, 640], [1280, 900]]) {
    const p = await open('/', { w, h, live: 'late', store });
    const row = await text(p, '.yt li');
    ok(/Departs \d\d:\d\d, 12 min late/.test(row) && /Arrives at Berlin Südkreuz \d\d:\d\d, 9 min late/.test(row), `home ${w}: starred row names both ends ` + row.replace(/\s+/g, ' '));
    ok(/46\.8 min/.test(row), `home ${w}: usual delay read from the index, same as the train page (46.8) ` + row.replace(/\s+/g, ' '));
    const box = await p.locator('main input[type=search]').boundingBox();
    ok(box && box.y + box.height < h, `home ${w}: box on first screen`);
    ok(p.ov <= 0.5 && p.errs.length === 0, `home ${w}: no overflow, clean console ` + p.errs.join('|'));
    await close(p);
  }
  { const p = await open('/', { live: 'busy', store }); ok(/Live times are not available right now/.test(await text(p, '.yt li')) && await p.locator('.yt-banner').count() === 0, 'home: live feed down is said on the row (no page-wide banner that other rows could contradict)'); await close(p); }
  { const p = await open('/?q=ICE%201541%20today', { live: 'late' }); await p.waitForURL(/train\/ice-1541/, { timeout: 8000 }).catch(() => {}); ok(!/not where they are today/.test(await text(p, 'main')), 'today query: no "not live" note'); await close(p); }
  { const p = await open('/de/', { w: 320, h: 640 }); ok(p.ov <= 0.5 && p.errs.length === 0, 'home DE 320 clean'); await close(p); }

  // Card visit is remembered and shows on home under "Looked up lately".
  { const p = await open(card, { live: 'late' }); await p.goto(BASE + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    ok(/Looked up lately/.test(await text(p, 'main')) && /ICE 224/.test(await text(p, '.yt')), 'home: looked-up train listed'); await close(p); }

  // Route + time: the nearest train is marked, above the route figure.
  { const p = await open('/route/koeln-hbf-berlin-hbf/?t=08:14');
    const hit = await text(p, '.near .near-hit'); ok(/08:14/.test(hit), 'route ?t: nearest train marked ' + hit.replace(/\s+/g, ' '));
    const nearY = (await p.locator('.near').boundingBox()).y; const figY = (await p.locator('.fig').first().boundingBox()).y;
    ok(nearY < figY, 'route ?t: closest trains above the figure');
    ok(/min/.test(hit) && !/^\d+%$/.test(hit), 'route ?t: average minutes shown'); await close(p); }
} finally {
  await b.close();
}
console.log(`home-today: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
