// "My train today" home + live states, against MOCKED /api/live/ answers (tests/fixtures/live.mjs; no DB keys needed).
//   node tests/tools/serve.mjs &   then   node tests/e2e/home-today.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import { mockLive } from '../fixtures/live.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// `now` (ms): a fixed clock for the browser and the mocked answers, for checks whose words depend on the time of day.
// `prep(ctx)`: extra setup before the page loads (e.g. rewriting a search shard).
async function open(url, { w = 390, h = 844, live = 'disabled', store = null, now = null, prep = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 900, hasTouch: w < 900, locale: 'en-GB' });
  if (store) await ctx.addInitScript((s) => localStorage.setItem('gp-saved-v1', JSON.stringify(s)), store);
  if (prep) await prep(ctx);
  if (now !== null) await ctx.clock.setFixedTime(now);
  await mockLive(ctx, live, { now });
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
// The window's last month, as the search index says (the card shows "<month>, the latest month we have" only for it).
const LAST = JSON.parse(fs.readFileSync(new URL('../../data/search/index.json', import.meta.url))).window.lastMonth;
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
/** Serve the search shards with field 17 (latest months) of `unit` set to `recent`, whatever the committed data holds. */
const withRecent = (unit, recent) => async (ctx) => {
  await ctx.route('**/search/s-*.json', async (r) => {
    const res = await r.fetch();
    const recs = await res.json();
    for (const x of recs) if (x[2] === 0 && `${x[0]} ${x[1]}` === unit) { while (x.length < 17) x.push(null); x[17] = recent; }
    await r.fulfill({ response: res, json: recs });
  });
};
/** Today's date in Berlin at `hhmm` Berlin time, as ms (the offset is read for that instant, so it holds across DST). */
function berlinAt(hhmm) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const parts = (ms) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, +x.value || x.value]));
  const d = parts(Date.now());
  const guess = Date.UTC(d.year, d.month - 1, d.day, Math.floor(hhmm / 100), hhmm % 100);
  const g = parts(guess);
  return guess - (Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute) - guess);
}
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => '');

try {
  // Card: each live state says what DB reports, never "on time".
  const card = '/?q=ICE%20224';
  { const p = await open(card, { live: 'late' }); const box = await text(p, '.livenow');
    ok(/Departure/.test(box) && /12 min late/.test(box) && /Arrival/.test(box) && /9 min late/.test(box), 'card late: both ends ' + box.replace(/\s+/g, ' '));
    ok(/How late it has run/.test(await text(p, 'main')), 'card: history labelled');
    ok(await p.locator('main .savebtn').count() === 1 && /Save to home/.test(await text(p, 'main .savebtn')), 'card: save star, said in words');
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
  // The mocked next run starts 5 h after "now": at 10:00 Berlin that is today, at 21:00 it is tomorrow (fixed clocks, so
  // the result does not depend on when the suite runs).
  { const p = await open(card, { live: 'next', now: berlinAt(1000) }); ok(/Next: today/.test(await text(p, '.ln-next')), 'card next: next run line (10:00, today) ' + await text(p, '.ln-next')); await close(p); }
  { const p = await open(card, { live: 'next', now: berlinAt(2100) }); ok(/Next: tomorrow/.test(await text(p, '.ln-next')), 'card next: next run line (21:00, tomorrow) ' + await text(p, '.ln-next')); await close(p); }
  { const p = await open(card, { live: 'platform' }); ok(/Platform changed: now 12/.test(await text(p, '.livenow')), 'card platform change line'); await close(p); }
  { const p = await open(card, { live: 'late' }); ok(/last stop in Germany/.test(await text(p, 'main')) && /goes on to Amsterdam/.test(await text(p, '.livenow')), 'card: train ending abroad explained'); await close(p); }

  // Latest month on the card: the same line as the train page, from search record field 17 (scripts/compute.py), only for
  // the window's last month with 8+ measured runs; "early" for a negative average; German at 320 px without overflow.
  { const p = await open(card, { prep: withRecent('ICE 224', [[prevMonth(prevMonth(LAST)), 30, 5.1], [prevMonth(LAST), 28, 6.2], [LAST, 26, 7.4]]) });
    const t = await text(p, 'main .lately');
    ok(/, the latest month we have: 7\.4 min late on average\./.test(t), 'card: latest month line ' + t);
    const box = await p.locator('main .lately').boundingBox(); const fig = await p.locator('main .fig').first().boundingBox().catch(() => null);
    ok(box && fig && box.y > fig.y, 'card: latest month under the history figure');
    ok(p.ov <= 0.5 && p.errs.length === 0, 'card latest month: no overflow, clean console ' + p.errs.join('|')); await close(p); }
  { const p = await open(card, { prep: withRecent('ICE 224', [[LAST, 26, -1.2]]) });
    ok(/1\.2 min early on average/.test(await text(p, 'main .lately')), 'card: latest month early'); await close(p); }
  { const p = await open(card, { prep: withRecent('ICE 224', [[LAST, 7, 7.4]]) });
    ok(await p.locator('main .lately').count() === 0, 'card: no latest month line under 8 runs'); await close(p); }
  { const p = await open(card, { prep: withRecent('ICE 224', [[prevMonth(LAST), 26, 7.4]]) });
    ok(await p.locator('main .lately').count() === 0, 'card: no latest month line when the train did not run in the last month'); await close(p); }
  { const p = await open(card, { prep: withRecent('ICE 224', []) });
    ok(await p.locator('main .lately').count() === 0 && p.errs.length === 0, 'card: no line and no error without the field'); await close(p); }
  { const p = await open('/de/?q=ICE%20224', { w: 320, h: 640, prep: withRecent('ICE 224', [[LAST, 26, 7.4]]) });
    const t = await text(p, 'main .lately');
    ok(/, der jüngste Monat in unseren Daten: im Schnitt 7,4 Min\. zu spät\./.test(t), 'card DE: latest month line ' + t);
    ok(p.ov <= 0.5 && p.errs.length === 0, 'card DE 320: no overflow, clean console ' + p.errs.join('|')); await close(p); }

  // Route lists never show a train running the other way (arrival more than 12 h after departure).
  { const p = await open('/route/ulm-hbf-duesseldorf-hbf/?t=15:33');
    const bad = await p.$$eval('table.tt td.time', (tds) => tds.map((td) => td.innerText.split(/\s+/)).filter(([d, a]) => d && a).map(([d, a]) => { const m = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5); return (((m(a) - m(d)) % 1440) + 1440) % 1440; }).filter((x) => x > 720).length);
    ok(bad === 0, 'route lists: no train running the other way (' + bad + ')');
    ok(!/ICE\s517/.test(await text(p, 'main')), 'route: ICE 517 (other direction) not listed'); await close(p); }

  // Mid-route riders: pick this train's own stops, land on that route with this train marked.
  { const p = await open(card, { live: 'late' });
    await p.locator('.own-toggle').click(); const n = await p.locator('.own-row').count();
    ok(n >= 3, 'card: own stops listed ' + n);
    await p.locator('.own-row').nth(2).click(); await p.locator('.own-row').nth(n - 2).click();
    await p.waitForURL(/\/route\/|r=1/, { timeout: 8000 }).catch(() => {});
    ok(/\/route\/.*\?t=\d\d:\d\d|r=1/.test(p.url()), 'card: own stops land on the route with the time ' + p.url());
    if (/\/route\//.test(p.url())) { await p.waitForTimeout(800); ok(/ICE\s224/.test(await text(p, '.near .near-hit')), 'route: this train is the marked one'); }
    await close(p); }

  // Home: box on the first screen; a starred train shows both ends, labelled.
  const store = { en: [{ kind: 'train', href: '/train/ice-1541/', title: 'ICE 1541', sub: 'Köln Hbf → Berlin Südkreuz', avg: 11.2, live: 'ICE 1541' }], de: [] };
  for (const [w, h] of [[390, 844], [320, 640], [1280, 900]]) {
    const p = await open('/', { w, h, live: 'late', store });
    const row = await text(p, '.yt li');
    ok(/Departure: 12 min late, expected \d\d:\d\d/.test(row) && /Arrival at Berlin Südkreuz: 9 min late, expected \d\d:\d\d/.test(row), `home ${w}: starred row names both ends ` + row.replace(/\s+/g, ' '));
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
    ok(/Looked up lately/.test(await text(p, 'main')) && /ICE\s224/.test(await text(p, '.yt')), 'home: looked-up train listed'); await close(p); }

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
