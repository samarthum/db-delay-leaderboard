// Screenshots of the home page and the search flows in every state that matters, with live answers mocked
// (tests/fixtures/live.mjs; there are no DB keys here). For design review rounds, not a pass/fail suite.
//   node tests/tools/serve.mjs &   then   OUT=/tmp/shots/r1 node tests/tools/home-shots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { mockLive, stamp } from '../fixtures/live.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const OUT = process.env.OUT || '/tmp/home-shots';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
fs.mkdirSync(OUT, { recursive: true });
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
const report = [];

const SAVED = {
  en: [
    { kind: 'train', href: '/train/ice-1541/', title: 'ICE 1541', sub: 'Köln Hbf → Berlin Südkreuz', avg: 11.2, live: 'ICE 1541' },
    { kind: 'route', href: '/route/koeln-hbf-berlin-hbf/', title: 'Köln Hbf → Berlin Hbf', sub: '30 trains a day', avg: 14.1 },
  ],
  de: [
    { kind: 'train', href: '/de/zug/ice-1541/', title: 'ICE 1541', sub: 'Köln Hbf → Berlin Südkreuz', avg: 11.2, live: 'ICE 1541' },
    { kind: 'route', href: '/de/strecke/koeln-hbf-berlin-hbf/', title: 'Köln Hbf → Berlin Hbf', sub: '30 Züge am Tag', avg: 14.1 },
  ],
};
const RECENT = {
  en: [{ href: '/?q=ICE%20224', title: 'ICE 224', sub: 'München Hbf → Oberhausen Hbf', value: '9.6 min late', live: 'ICE 224' }],
  de: [{ href: '/de/?q=ICE%20224', title: 'ICE 224', sub: 'München Hbf → Oberhausen Hbf', value: '9,6 Min. zu spät', live: 'ICE 224' }],
};

async function shot(name, { w = 390, h = 844, url = '/', live = 'disabled', store = null, act = null, full = false, boardBody = null } = {}) {
  if (ONLY && !ONLY.test(name)) return;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 900, hasTouch: w < 900, locale: 'en-GB' });
  if (store) await ctx.addInitScript((s) => { localStorage.setItem('gp-saved-v1', JSON.stringify(s.saved)); localStorage.setItem('gp-recent-v1', JSON.stringify(s.recent)); }, store);
  await mockLive(ctx, live);
  if (boardBody) await ctx.route('**/api/live/?from=**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(boardBody) }));
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/scribe-token/.test(m.text())) errs.push(m.text().slice(0, 140)); });
  try {
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(400);
    if (act) await act(p);
    await p.waitForTimeout(500);
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
    // A full-page capture would paint the fixed tab bar in the middle of the page: pin it to the end instead.
    if (full) await p.addStyleTag({ content: 'nav[class*="tabbar"]{position:static!important} body{padding-bottom:0!important}' });
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    report.push(`${name}: overflow ${ov}, errors ${errs.length}${errs.length ? ' ' + errs.join(' | ') : ''}, url ${p.url().replace(BASE, '')}`);
  } catch (e) {
    report.push(`${name}: FAILED ${e.message.split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}

const both = { saved: SAVED, recent: RECENT };
const openSheet = async (p) => { await p.locator('main input[type=search]').first().click(); await p.waitForTimeout(400); };
const typeIn = (q, wait = 1400) => async (p) => { await openSheet(p); await p.keyboard.type(q, { delay: 35 }); await p.waitForTimeout(wait); };

// Home, first visit.
await shot('01-home-390', { full: true });
await shot('02-home-390-fold');
await shot('03-home-320-de', { w: 320, h: 640, url: '/de/', full: true });
await shot('04-home-390-de-fold', { url: '/de/' });
await shot('06-home-320-en-saved', { w: 320, h: 640, store: both, live: { 'ICE 1541': 'late', 'ICE 224': 'noArr' } });
await shot('05-home-1280', { w: 1280, h: 900, full: true });
// Home, returning visitor with saved + recent trains, live states.
await shot('10-home-saved-late', { store: both, live: { 'ICE 1541': 'late', 'ICE 224': 'onTime' } });
await shot('11-home-saved-cancelled', { store: both, live: { 'ICE 1541': 'cancelled', 'ICE 224': 'next' } });
await shot('12-home-saved-livedown', { store: both, live: 'busy' });
await shot('13-home-saved-320-de', { w: 320, h: 640, url: '/de/', store: both, live: { 'ICE 1541': 'platform', 'ICE 224': 'late' }, full: true });
await shot('14-home-saved-1280', { w: 1280, h: 900, store: both, live: { 'ICE 1541': 'late', 'ICE 224': 'onTime' } });
// Search.
await shot('20-search-focused-390', { act: openSheet });
await shot('21-search-typing-train-390', { act: typeIn('ICE 22', 900) });
await shot('22-search-typing-route-time-390', { act: typeIn('8:14 Köln to Berl') });
await shot('23-search-typing-station-390', { act: typeIn('Hannov') });
await shot('24-search-focused-320-de', { w: 320, h: 640, url: '/de/', act: openSheet });
await shot('25-search-focused-1280', { w: 1280, h: 900, act: async (p) => { await p.locator('main input[type=search]').click(); await p.waitForTimeout(300); } });
await shot('26-search-typing-1280', { w: 1280, h: 900, act: async (p) => { await p.locator('main input[type=search]').click(); await p.keyboard.type('köln to ber', { delay: 35 }); await p.waitForTimeout(1400); } });
// Results: a train with no page of its own (search result card), each live state.
for (const s of ['late', 'onTime', 'cancelled', 'unknown', 'next', 'busy', 'noArr', 'platform']) await shot(`30-card-${s}-390`, { url: '/?q=ICE%20224', live: s, full: true });
await shot('31-card-abroad-390', { url: '/?q=ICE%20123', live: 'abroad', full: true });
await shot('32-card-late-320-de', { w: 320, h: 640, url: '/de/?q=ICE%20224', live: 'late', full: true });
await shot('33-card-late-1280', { w: 1280, h: 900, url: '/?q=ICE%20224', live: 'late', full: true });
// Landing pages the search opens.
await shot('40-train-page-late-390', { url: '/train/ice-1541/', live: 'late' });
await shot('41-route-time-390', { url: '/route/koeln-hbf-berlin-hbf/?t=08:14', live: 'late', full: true });
await shot('42-station-390', { url: '/?q=Hannover%20Hbf&s=Hannover%20Hbf', full: true });
await shot('43-station-through-390', { url: '/?q=Hannover%20Hbf&s=Hannover%20Hbf', act: async (p) => { await p.locator('main button:has-text("Where are you going")').click(); await p.waitForTimeout(600); await p.keyboard.type('Ber', { delay: 40 }); await p.waitForTimeout(1400); } });
{
  // A route + time search for a train that leaves within the live board's two hours: today's state shows on the marked row.
  const routes = JSON.parse(fs.readFileSync(new URL('../../data/routes.json', import.meta.url)));
  const r = routes.routes.find((x) => x.slug === 'koeln-hbf-berlin-hbf');
  const tr = r.list.find((x) => x[4] !== null);
  const hh = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}${String(m % 60).padStart(2, '0')}`;
  const day = stamp(0).slice(0, 6);
  const body = { ok: true, from: 'Köln Hbf', to: 'Berlin Hbf', asOf: stamp(0), trains: [{ cat: tr[0], n: tr[1], pd: day + hh(tr[2]), late: 17, canc: false, plat: '5', platChanged: false, pa: day + hh(tr[3]), lateArr: 14, arrCanc: false }] };
  await shot('44-route-time-live-390', { url: `/route/koeln-hbf-berlin-hbf/?t=${hh(tr[2]).slice(0, 2)}:${hh(tr[2]).slice(2)}`, boardBody: body });
}
await shot('45-train-page-abroad-end-390', { url: '/train/ec-249/', live: 'late' });
await shot('46-card-own-stops-open-390', { url: '/?q=ICE%20224', live: 'late', act: async (p) => { await p.locator('.own-toggle').click(); await p.waitForTimeout(300); await p.locator('.own-row').nth(2).click(); await p.waitForTimeout(300); await p.locator('.own-toggle').scrollIntoViewIfNeeded(); }, full: true });
await shot('47-card-own-stops-landed-390', { url: '/?q=ICE%20224', live: 'late', act: async (p) => { await p.locator('.own-toggle').click(); await p.locator('.own-row').nth(2).click(); await p.locator('.own-row').nth(8).click(); await p.waitForURL(/route|r=1/, { timeout: 8000 }); await p.waitForTimeout(1200); } });

// The stop picker's landing when the train leaves more than two hours from now: when live times will start.
{
  const p2 = (n) => String(n).padStart(2, '0');
  const later = stamp(200);
  await shot('48-route-later-390', { url: `/route/koeln-hbf-berlin-hbf/?t=${later.slice(6, 8)}:${later.slice(8, 10)}`, live: 'next', boardBody: { ok: true, from: 'Köln Hbf', to: 'Berlin Hbf', asOf: stamp(0), trains: [] } });
}
fs.writeFileSync(path.join(OUT, 'report.txt'), report.join('\n') + '\n');
console.log(report.join('\n'));
await b.close();
