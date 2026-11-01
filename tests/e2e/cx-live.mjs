import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Change trains, live: picks changes due in the next hours whose arriving train DB knows, opens them at 390 px.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const R = ROOT + '/';
const P = JSON.parse(fs.readFileSync(R + 'data/connection-pairs.json', 'utf8'));
const S = JSON.parse(fs.readFileSync(R + 'data/live-stations.json', 'utf8'));
const short = (n) => n.replace('Hauptbahnhof', 'Hbf').replace(/^Frankfurt \(Main\) /, 'Frankfurt ').replace(/ \((Westf|Breisgau|Saale|Oder)\)/, '').replace('Frankfurt am Main Flughafen Fernbahnhof', 'Frankfurt Flughafen');
const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
const now = +p.hour * 60 + +p.minute;
const cands = [];
for (const [a, t] of Object.entries(P)) for (const [st, x] of Object.entries(t.s)) {
  if (!S[short(st)] || ['Düsseldorf Flughafen', 'Köln Messe/Deutz', 'Stendal Hbf', 'Wolfsburg Hbf'].includes(short(st))) continue;
  const d = (x.t - now + 1440) % 1440; if (d < 10 || d > 120) continue;
  cands.push([d, a, st, x.b[0][0]]);
}
cands.sort((x, y) => x[0] - y[0]);
const SH = SHOTS + '/';
let pass = 0, fail = 0, seen = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  for (const [d, a, st, bn] of cands.slice(0, 14)) {
    if (seen >= 4) break;
    await pg.goto(`${BASE}/change/?${new URLSearchParams({ t: a, at: st, n: bn })}`, { waitUntil: 'networkidle' });
    await pg.waitForTimeout(2500);
    const banner = pg.locator('.cx-live');
    if (!(await banner.count())) { console.log(`  ${a} @ ${short(st)} in ${d}m: DB has no record (no banner)`); continue; }
    seen++;
    const bt = (await banner.innerText()).replace(/\s+/g, ' ');
    const today = pg.locator('.cx-today');
    const tt = (await today.count()) ? (await today.innerText()).replace(/\s+/g, ' ') : '(no today block)';
    console.log(`  ${a} @ ${short(st)} in ${d}m -> ${bn}\n    banner: ${bt}\n    today: ${tt}`);
    ok(/^Today /.test(bt), 'banner starts with Today');
    ok(await today.count() === 1, 'answer has Today, live');
    ok(!/-\d+ min to change|NaN|undefined/.test(tt + bt), 'no negative/NaN text');
    ok(await pg.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, 'no overflow');
    if (seen === 1) { await pg.locator('.cx-today').scrollIntoViewIfNeeded(); await pg.screenshot({ path: SH + 'cx-live.png' }); }
  }
  ok(seen > 0, 'found at least one live change');
  // a change far from now: no live parts, old history line
  const far = Object.entries(P).flatMap(([a, t]) => Object.entries(t.s).map(([st, x]) => [a, st, x])).find(([, , x]) => (x.t - now + 1440) % 1440 > 600 && (x.t - now + 1440) % 1440 < 1300);
  await pg.goto(`${BASE}/change/?${new URLSearchParams({ t: far[0], at: far[1], n: far[2].b[0][0] })}`, { waitUntil: 'networkidle' }); await pg.waitForTimeout(1500);
  ok(await pg.locator('.cx-live, .cx-today').count() === 0, 'far change: no live parts');
  ok(/History, not live/.test(await pg.locator('tr.det').innerText()), 'far change: history line');
  ok(errs.length === 0, 'no page errors ' + errs.join('|'));
} finally { await b.close(); }
console.log(`cx-live: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
