// Screenshots of "The last 7 days" on the search card and the train page in every data state, at 390 / 320 (German) /
// 1280, with live and last-7-days answers mocked (tests/fixtures/). For design review rounds, not a pass/fail suite.
//   node tests/tools/serve.mjs &   then   OUT=/tmp/wk-shots/r1 node tests/tools/last7-shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { mockLive } from '../fixtures/live.mjs';
import { mockLast7 } from '../fixtures/last7.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const OUT = process.env.OUT || '/tmp/wk-shots';
fs.mkdirSync(OUT, { recursive: true });
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
const report = [];

async function shot(name, { w = 390, h = 844, url, week = 'full', live = 'late', locale = 'en-GB' }) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 900, hasTouch: w < 900, locale });
  await mockLive(ctx, live);
  await mockLast7(ctx, week);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/scribe-token/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  await p.goto(BASE + url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(600);
  await p.addStyleTag({ content: 'nav[class*="tabbar"]{position:static!important} body{padding-bottom:0!important}' });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
  // From the top of the page to a little below the block: the block in its context (live box above, history below).
  const box = await p.evaluate(() => { const e = document.querySelector('.wk') || document.querySelector('.past-h'); if (!e) return null; const r = e.getBoundingClientRect(); return { bottom: r.bottom + window.scrollY }; });
  const height = Math.min(box ? Math.ceil(box.bottom + 140) : h, 4000);
  await p.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: w, height }, fullPage: true });
  report.push(`${name}: overflow ${ov}px, console errors ${errs.length}${errs.length ? ' ' + errs.join(' | ') : ''}`);
  await ctx.close();
}

const CARD = '/?q=ICE%20224';
const PAGE = '/train/ice-1541/';
for (const week of ['full', 'gaps', 'cancel']) {
  await shot(`card-390-${week}`, { url: CARD, week });
  await shot(`page-390-${week}`, { url: PAGE, week });
  await shot(`page-320-de-${week}`, { w: 320, h: 700, url: '/de/zug/ice-1541/', week, locale: 'de-DE' });
  await shot(`card-320-de-${week}`, { w: 320, h: 700, url: '/de/?q=ICE%20224', week, locale: 'de-DE' });
}
await shot('page-1280-full', { w: 1280, h: 900, url: PAGE, week: 'full' });
await shot('card-1280-cancel', { w: 1280, h: 900, url: CARD, week: 'cancel' });
await shot('card-390-other', { url: CARD, week: 'other' });
await shot('card-390-absent', { url: CARD, week: 'absent' });
await shot('page-390-stale', { url: PAGE, week: 'stale', live: 'next' });
await shot('card-390-full-cancelled-today', { url: CARD, week: 'full', live: 'cancelled' });
await b.close();
fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
