import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Live-first checks against serve-live.cjs (real DB feed) on :4602. Trains chosen at run time from live-trains.json.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const SH = SHOTS + '/';
const SOON = process.env.SOON || 'ice-1541'; // a train page whose train runs in the next hours
const IDLE = process.env.IDLE || 'ice-707';  // one that does not run now
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  await p.goto(`${BASE}/train/${SOON}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  const box = p.locator('.livenow');
  ok(await box.count() === 1, 'soon train: live box shown');
  if (await box.count()) {
    const txt = (await box.innerText()).replace(/\s+/g, ' '); console.log('  box:', txt);
    ok(/Today .* from /.test(txt), 'live box head');
    ok(/No delay reported|min late|Cancelled/.test(txt), 'live box status');
    const bb = await box.boundingBox(); const fb = await p.locator('.fig').boundingBox();
    ok(bb.y < fb.y && bb.y < 500, 'live box above figure, in first screen');
  }
  ok(await p.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, 'no overflow');
  await p.screenshot({ path: SH + 'train-soon.png' });
  // save
  const star = p.locator('.titlerow button.savebtn'); ok(await star.count() === 1, 'star on train page');
  await star.click(); ok(await star.getAttribute('aria-pressed') === 'true', 'star pressed');
  await p.goto(`${BASE}/train/${IDLE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  ok(await p.locator('.livenow').count() === 0 && await p.locator('.ln-next').count() === 1, 'idle train: next-run line, no live box');
  await p.locator('.titlerow button.savebtn').click();
  await p.goto(`${BASE}/route/hamburg-hbf-berlin-hbf/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  await p.locator('.titlerow button.savebtn').click();
  const lb = p.locator('section.live');
  if (await lb.count()) { const y = (await lb.boundingBox()).y; const ty = (await p.locator('h2:has-text("Trains on this route")').boundingBox()).y; ok(y < ty, 'route: live board above train list'); console.log('  route live rows', await lb.locator('tbody tr').count()); }
  else console.log('  route: no live trains right now (block hidden, ok)');
  await p.screenshot({ path: SH + 'route.png' });
  // home: Your trains
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  const yt = p.locator('section.yt'); ok(await yt.count() === 1, 'home: your trains');
  const rows = await yt.locator('li').allInnerTexts(); console.log('  your trains:', rows.map(r => r.replace(/\s+/g, ' ')));
  ok(rows.length === 3, 'home: 3 saved');
  ok(rows.some(r => /Today/.test(r)), 'home: saved soon train shows live');
  ok(await p.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, 'home no overflow');
  await p.screenshot({ path: SH + 'home.png' });
  // unsave
  await p.goto(`${BASE}/train/${IDLE}/`, { waitUntil: 'networkidle' }); await p.locator('.titlerow button.savebtn').click();
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  ok((await p.locator('section.yt li').count()) === 2, 'home: unsave removes');
  // DE
  await p.goto(`${BASE}/de/zug/${SOON}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
  if (await p.locator('.livenow').count()) console.log('  de box:', (await p.locator('.livenow').innerText()).replace(/\s+/g, ' '));
  await p.screenshot({ path: SH + 'train-de.png' });
  ok(errs.filter(e => !/404/.test(e)).length === 0, 'console clean: ' + errs.join(' | '));
} finally { await b.close(); }
console.log(`live-now: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
