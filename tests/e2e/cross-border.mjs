// The owner's acceptance test for cross-border trains: six searches typed into the box (no &r=1 in the address),
// each lists the trains that run that way; picking one shows "Your trip" with BOTH stops, a live line at each end
// (against MOCKED /api/live/ trip answers, tests/fixtures/live.mjs TRIP) and a history line at each end (figures, or
// the honest "no history abroad yet for <country>"). English and German, 390 px and 320 px, no overflow, no console
// errors.
//   node tests/tools/serve.mjs &   then   node tests/e2e/cross-border.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockLive } from '../fixtures/live.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// [typed, language, start stop words, end stop words]: the trip block must name a stop matching each.
const SEARCHES = [
  ['amsterdam to dusseldorf', '', /Amsterdam/, /Düsseldorf/],
  ['düsseldorf amsterdam', '', /Düsseldorf/, /Amsterdam/],
  ['Köln Bruxelles', '', /Köln/, /Bruxelles|Brussels/],
  ['München Wien', '', /München/, /Wien/],
  ['Basel Frankfurt', '', /Basel/, /Frankfurt/],
  ['Berlin Praha', '', /Berlin/, /Praha/],
  ['Amsterdam nach Düsseldorf', '/de', /Amsterdam/, /Düsseldorf/],
];

async function page(w, trip) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'en-GB' });
  await mockLive(ctx, 'unknown', { trip });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/scribe-token/.test(m.text())) p.errs.push(m.text()); });
  return p;
}
const flat = async (p, sel = 'main') => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);

async function search(p, lang, q) {
  await p.goto(`${BASE}${lang}/`, { waitUntil: 'networkidle' });
  // Phones: the home box is a door to the full-screen search sheet, which takes the typing.
  await p.locator('main input[type=search]').tap();
  await p.waitForTimeout(300);
  await p.keyboard.type(q, { delay: 25 });
  await p.waitForTimeout(900);
  await p.keyboard.press('Enter');
  await p.waitForTimeout(2200);
}

let shot = 0;
for (const [q, lang, from, to] of SEARCHES) {
  for (const w of lang ? [390] : [390, 320]) {
    const p = await page(w, 'late');
    await search(p, lang, q);
    const rows = p.locator('[class*=option]');
    const n = await rows.count();
    const list = await flat(p);
    console.log(` ${q} @${w}: ${n} rows | ${list.slice(0, 220)}`);
    ok(n > 0 && !/Nothing found|Nichts gefunden|aren't covered/.test(list), `${q}@${w}: a list of trains`);
    if (n > 0) {
      await rows.first().click();
      await p.waitForTimeout(2500);
      const trip = await flat(p, '.trip');
      console.log(`   trip: ${trip.slice(0, 400)}`);
      ok(trip.length > 0, `${q}@${w}: trip block shown (${p.url()})`);
      const legs = p.locator('.trip .ln-leg');
      ok(await legs.count() === 2, `${q}@${w}: two ends`);
      const a = await flat(p, '.trip .ln-leg[data-end=on]');
      const z = await flat(p, '.trip .ln-leg[data-end=off]');
      ok(from.test(a) && to.test(z), `${q}@${w}: start ${a.slice(0, 80)} / end ${z.slice(0, 80)}`);
      ok(lang ? /Verspätung|keine Verspätung/.test(a) && /Verspätung/.test(z) : /min late|No delay reported/.test(a) && /min late/.test(z), `${q}@${w}: live at both ends`);
      ok(await p.locator('.trip .ln-hist').count() === 2, `${q}@${w}: history line at both ends`);
      ok(!/undefined|NaN|null|\{/.test(trip), `${q}@${w}: clean text`);
      ok(!/on time|pünktlich/i.test(trip), `${q}@${w}: never "on time"`);
      ok(await overflow(p) <= 0.5, `${q}@${w}: no overflow`);
      if (w === 390 && shot < 7 && trip) await p.locator('.trip').screenshot({ path: `${SHOTS}/trip-${shot++}.png` });
    }
    ok(p.errs.length === 0, `${q}@${w}: console ${p.errs.join(' | ')}`);
    await p.context().close();
  }
}

// Other live states on one trip: no live data abroad + cancelled in Germany; not running now.
{
  const p = await page(390, 'mixed');
  await search(p, '', 'amsterdam to dusseldorf');
  await p.locator('[class*=option]').first().click();
  await p.waitForTimeout(2500);
  const t = await flat(p, '.trip');
  ok(/No live times for this stop right now/.test(t) && /Cancelled/.test(t), 'mixed: no live abroad, cancelled in Germany ' + t.slice(0, 300));
  await p.context().close();
}
{
  const p = await page(390, 'none');
  await search(p, '', 'amsterdam to dusseldorf');
  await p.locator('[class*=option]').first().click();
  await p.waitForTimeout(2500);
  const t = await flat(p, '.trip');
  ok(/Live times show from three hours before it leaves/.test(t) && await p.locator('.trip .ln-status').count() === 0, 'not now: planned times + history, no live claim ' + t.slice(0, 300));
  ok(/In the past/.test(t), 'not now: history still shown');
  await p.context().close();
}
// A stop abroad without a source says so instead of a guess; one with a source shows its figure.
{
  const p = await page(390, 'onTime');
  await search(p, '', 'München Wien');
  const stat = await flat(p, '[class*=option]');
  ok(/no data abroad/.test(stat), 'route row: "no data abroad" for Austria (no source): ' + stat.slice(0, 120));
  await search(p, '', 'Köln Bruxelles');
  const be = await flat(p, '[class*=option]');
  ok(/\d+% late|few trips/.test(be) && !/no data abroad/.test(be.split('ICE')[1] || ''), 'route row: Belgium has figures (Infrabel): ' + be.slice(0, 120));
  await p.context().close();
}

await b.close();
console.log(`cross-border: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
