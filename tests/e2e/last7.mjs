// "The last 7 days" on the search card and the train page, against MOCKED /last7/ answers (tests/fixtures/last7.mjs).
//   node tests/tools/serve.mjs &   then   node tests/e2e/last7.mjs
import { chromium } from 'playwright';
import { mockLast7, days } from '../fixtures/last7.mjs';
import { mockLive } from '../fixtures/live.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

async function open(url, { w = 390, h = 844, week = 'full', mock = true, locale = 'en-GB' } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 900, hasTouch: w < 900, locale });
  await mockLive(ctx, 'late');
  if (mock) await mockLast7(ctx, week);
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/scribe-token/.test(m.text())) p.errs.push(m.text()); });
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  p.ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
  return p;
}
const close = (p) => p.context().close();
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => '');
const flat = (s) => s.replace(/\s+/g, ' ');

const CARD = '/?q=ICE%20224';
const PAGE = '/train/ice-1541/';
try {
  for (const [where, url] of [['card', CARD], ['page', PAGE]]) {
    { const p = await open(url, { week: 'full' }); const wk = flat(await text(p, '.wk'));
      ok(/The last 7 days/.test(wk), `${where} full: block shown`);
      ok(await p.locator('.wk .wk-day').count() === 7, `${where} full: 7 day columns`);
      ok(await p.locator('.wk .wk-cell').count() === 14, `${where} full: departure and arrival mark per day`);
      ok(/11 min late on average, 15\+ min late on 2 of 7 days/.test(wk), `${where} full: sentence ` + wk);
      ok(!/on time/i.test(wk), `${where} full: never "on time"`);
      ok(/the latest day with complete data/.test(wk), `${where} full: as-of date said`);
      ok(/Measured only at .* and /.test(wk), `${where} full: names the two stations it is measured at`);
      // The block sits under today's live box, above the long history.
      const order = await p.evaluate(() => { const a = document.querySelector('.livenow'), w = document.querySelector('.wk'), h = [...document.querySelectorAll('h2, h4')].find((x) => /How late it has run/.test(x.textContent)); return !!(a && w && h && (a.compareDocumentPosition(w) & 4) && (w.compareDocumentPosition(h) & 4)); });
      ok(order, `${where} full: after the live box, before the history`);
      // A reported 0 is grey (no delay reported), never green; 22 is red.
      const colors = await p.$$eval('.wk-marks td .wk-mark', (els) => els.map((e) => getComputedStyle(e).backgroundColor));
      ok(!colors.some((c) => /29, 122, 73/.test(c)), `${where} full: no green mark`);
      ok(colors.some((c) => /196, 43, 28/.test(c)), `${where} full: 15+ in red`);
      ok(p.ov <= 0.5 && p.errs.length === 0, `${where} full: no overflow, clean console ` + p.errs.join('|')); await close(p); }

    { const p = await open(url, { week: 'gaps' }); const wk = flat(await text(p, '.wk'));
      ok(/16 min late on average, 15\+ min late on 1 of 3 days/.test(wk), `${where} gaps: averages only measured days ` + wk);
      ok(await p.locator('.wk-marks .wk-none').count() === 4, `${where} gaps: no-run days hollow at both ends`);
      ok(await p.locator('.wk-marks .wk-gap').count() === 2 && /\?/.test(wk), `${where} gaps: incomplete day shown as ?`);
      const hollow = await p.$$eval('.wk-none .wk-mark, .wk-gap .wk-mark', (els) => els.every((e) => getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0)'));
      ok(hollow, `${where} gaps: missing days are not filled (never read as fine)`);
      ok(p.errs.length === 0, `${where} gaps: clean console`); await close(p); }

    { const p = await open(url, { week: 'cancel' }); const wk = flat(await text(p, '.wk'));
      ok(/Cancelled on 3 days, all or part of the way/.test(wk), `${where} cancel: sentence ` + wk);
      ok(await p.locator('.wk-marks .wk-canc').count() === 4, `${where} cancel: × marks (whole run at both ends + one end each)`);
      await close(p); }
  }

  { const p = await open(CARD, { week: 'other' }); { const wk = flat(await text(p, '.wk')); ok(/ended at Hannover Hbf, not Oberhausen Hbf\. Not counted/.test(wk) && /22\*/.test(wk), 'card other: a different end stop is named and starred ' + wk); ok(await p.locator('.wk-marks .wk-elsewhere').count() === 1, 'card other: that cell drawn as not counted'); ok(/Ended at another station on 1 day/.test(wk), 'card other: said in the sentence'); ok(/9 min late on average, 15\+ min late on 1 of 6 days/.test(wk), 'card other: that day left out of the average ' + wk); } await close(p); }
  { const p = await open(CARD, { week: 'one' }); ok(/measured on one day only, 12 min late/.test(flat(await text(p, '.wk'))), 'card one: one measured day'); await close(p); }
  { const p = await open(CARD, { week: 'absent' }); ok(/No runs of ICE 224 found in Deutsche Bahn's data/.test(flat(await text(p, '.wk'))) && await p.locator('.wk-table').count() === 0, 'card absent: says no run'); ok(p.errs.length === 0, 'card absent: clean console'); await close(p); }
  { const p = await open(CARD, { week: 'empty' }); ok(await p.locator('.wk').count() === 0 && p.errs.length === 0, 'card empty index: no block, clean console'); await close(p); }
  { const p = await open(PAGE, { week: 'stale' }); ok(/Not updated for 6 days/.test(await text(p, '.wk')) && /^7 days to /.test(await text(p, '.wk-h')), 'page stale: says so, heading no longer says "last"'); ok(p.errs.length === 0, 'page stale: clean console'); await close(p); }
  { const p = await open(PAGE, { week: 'old' }); ok(await p.locator('.wk').count() === 0, 'page old (9 days): block hidden'); await close(p); }
  { const p = await open(PAGE, { week: 'full' }); const d = days(); const last = Number(d[6].slice(8, 10));
    ok(new RegExp(`\\b${last}\\b`).test(await text(p, '.wk-asof')), 'page: as-of shows the latest day'); await close(p); }

  // German, narrow phone and desktop.
  { const p = await open('/de/zug/ice-1541/', { w: 320, week: 'cancel', locale: 'de-DE' }); const wk = flat(await text(p, '.wk'));
    ok(/Die letzten 7 Tage/.test(wk) && /ausgefallen/.test(wk) && !/pünktlich/i.test(wk), 'de 320: German block ' + wk);
    ok(p.ov <= 0.5 && p.errs.length === 0, 'de 320: no overflow, clean console ' + p.ov + ' ' + p.errs.join('|')); await close(p); }
  { const p = await open('/de/?q=ICE%20224', { w: 320, week: 'gaps', locale: 'de-DE' }); ok(p.ov <= 0.5, 'de card 320 gaps: no overflow ' + p.ov); await close(p); }
  { const p = await open(PAGE, { w: 1280, h: 900, week: 'full' }); ok(await p.locator('.wk').isVisible() && p.ov <= 0.5, 'desktop: shown, no overflow'); await close(p); }

  // The real build: whatever data/last7.json holds (or an empty index) renders without errors.
  { const p = await open(PAGE, { mock: false }); ok(p.errs.length === 0, 'unmocked page: clean console ' + p.errs.join('|')); await close(p); }
} finally {
  await b.close();
}
console.log(`last7 e2e: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
