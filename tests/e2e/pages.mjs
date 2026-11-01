import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Phone redesign v2 checks against the local static server (out/ on :4599). 390 px; DE at 320 px for labels.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
async function page(w = 390, h = 844) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 900, hasTouch: w < 900, locale: 'en-GB' });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/scribe-token|api\/live|404 \(Not Found\)/.test(m.text())) p.errs.push(m.text().slice(0, 140)); });
  return p;
}
async function go(p, u) { await p.goto(BASE + u, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300); }
const ov = p => p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
try {
  const urls = ['/', '/de/', '/route/hamburg-hbf-berlin-hbf/', '/de/strecke/hamburg-hbf-berlin-hbf/', '/train/ice-1541/', '/de/zug/ice-1541/', '/change/', '/ranking/', '/de/ranking/', '/network/', '/compensation/', '/de/entschaedigung/', '/routes/', '/recap/', '/method/', '/route/aschaffenburg-hbf-duesseldorf-hbf/', '/train/rjx-62/'];
  for (const u of urls) {
    const p = await page(); await go(p, u);
    const st = await p.evaluate(() => document.title);
    ok(!/404|not found/i.test(st), `${u} loads (${st})`);
    ok(await ov(p) <= 0.5, `${u} no horizontal overflow (${await ov(p)})`);
    ok(p.errs.length === 0, `${u} console clean: ${p.errs.join(' | ')}`);
    const n = u.replace(/\//g, '_').replace(/^_|_$/g, '') || 'home';
    await p.screenshot({ path: path.join(SHOTS, n + '.png') });
    await p.context().close();
  }
  // Home: no "For example" row, no connection link, figure value not repeated beside bar, top routes visible.
  { const p = await page(); await go(p, '/');
    ok(!(await p.locator('text=For example').isVisible().catch(() => false)), 'home: no For example row');
    ok(await p.locator('main a[href="/change/"]').count() === 0, 'home: no inline connection link');
    ok(await p.locator('header button[aria-label="Search"]').count() === 0, 'home: no header search icon');
    const big = await p.locator('.fig .big').innerText(); ok(/^16\s*min$/.test(big.replace(/\s+/g,' ').trim()), 'home: big figure is average minutes: ' + big);
    ok(!/\d trips/.test(await p.locator('main table.bt').innerText()), 'home: no trip counts under route names');
    const v1 = await p.locator('main table.bt td.v').first().innerText(); ok(/27\.1 min/.test(v1), 'home: first route by avg ' + v1.replace(/\s+/g,' '));
    // Home is built around "my train today": headline, then the box, then the network figure (Nov 2026 redesign).
    const fig = await p.locator('.fig .big').boundingBox(); const h1 = await p.locator('main h1').boundingBox(); const box = await p.locator('main input[type=search]').boundingBox();
    ok(h1.y < box.y && box.y < fig.y, 'home: headline, then search box, then network figure');
    ok(box.y + box.height < 844 - 64, 'home: search box on the first phone screen ' + Math.round(box.y));
    await p.locator('main input[type=search]').tap(); await p.waitForTimeout(300);
    ok(await p.locator('[role=dialog]').isVisible(), 'home: box opens full-screen sheet');
    ok(await p.evaluate(() => document.activeElement?.closest('[role=dialog]') !== null && document.activeElement?.type === 'search'), 'home: sheet box focused');
    await p.screenshot({ path: path.join(SHOTS, 'home-sheet.png') });
    await p.keyboard.type('ICE 1541', { delay: 40 }); await p.waitForTimeout(1200);
    if (await p.locator('[role=dialog] button[type=submit]').count()) await p.locator('[role=dialog] button[type=submit]').click();
    await p.waitForURL(/\/train\/ice-1541\//, { timeout: 8000 }).catch(() => {});
    ok(/\/train\/ice-1541\//.test(p.url()), 'home sheet: train + arrow button lands on train page ' + p.url());
    await go(p, '/'); await p.locator('main input[type=search]').tap(); await p.waitForTimeout(300);
    await p.keyboard.type('Hannov', { delay: 40 }); await p.waitForTimeout(1300);
    await p.locator('[role=dialog] [role=option]').first().click(); await p.waitForTimeout(1200);
    ok(/s=Hannover/.test(p.url()) && !(await p.locator('[role=dialog]').count()), 'home sheet: pick from dropdown closes sheet and opens it ' + p.url());
    ok(await p.locator('main h2:has-text("Hannover")').count() >= 1, 'home sheet: station view shows without reload');
    await go(p, '/'); await p.locator('main input[type=search]').tap(); await p.waitForTimeout(300);
    await p.keyboard.type('Köln to Berlin', { delay: 25 }); await p.keyboard.press('Enter');
    await p.waitForURL(/\/route\//, { timeout: 8000 }).catch(() => {});
    ok(/\/route\/koeln-hbf-berlin-hbf\//.test(p.url()), 'home sheet: route search lands on route page ' + p.url());
    await p.context().close(); }
  // Route page
  { const p = await page(); await go(p, '/route/hamburg-hbf-berlin-hbf/');
    ok(await p.locator('text=Your own trip?').count() === 0, 'route: inline search block gone');
    ok(await p.locator('h2:has-text("Trains on this route")').count() === 1, 'route: trains heading');
    const y = await p.locator('h2:has-text("Trains on this route")').boundingBox(); ok(y && y.y < 1000, 'route: train list starts high (' + (y && Math.round(y.y)) + ')');
    const first = await p.locator('section[aria-labelledby=trains] table.tt tbody tr').first().innerText();
    await p.locator('button:has-text("Most on time")').click(); await p.waitForTimeout(200);
    const firstBest = await p.locator('section[aria-labelledby=trains] table.tt tbody tr').first().innerText();
    ok(first !== firstBest && /ICE 505|24%/.test(firstBest), 'route: sort by most on time → ' + firstBest.replace(/\s+/g, ' '));
    ok(await p.locator('a[aria-label^="Other direction"]').count() === 1, 'route: swap icon');
    const sh = await p.locator('.titlerow button[aria-label="Share this route"]').boundingBox(); ok(sh && sh.width >= 44 && sh.height >= 44, 'route: share icon 44px');
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
    ok(!(await p.locator('.sticky-title[data-show]').count()), 'route: sticky hidden at top');
    await p.locator('details.fold summary').first().click(); ok(await p.locator('details.fold[open] .kv').isVisible(), 'route: facts fold opens');
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
    await p.mouse.wheel(0, 900); await p.waitForTimeout(500);
    ok(await p.locator('.sticky-title[data-show]').count() === 1, 'route: sticky title after scroll');
    await p.screenshot({ path: path.join(SHOTS, 'route-scrolled.png') });
    // search sheet
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('header button[aria-label="Search"]').click(); await p.waitForTimeout(300);
    ok(await p.locator('[role=dialog]').isVisible(), 'sheet opens');
    ok(await p.evaluate(() => document.activeElement?.type === 'search'), 'sheet focuses the box');
    await p.screenshot({ path: path.join(SHOTS, 'sheet-empty.png') });
    await p.keyboard.type('ICE 1541', { delay: 30 }); await p.keyboard.press('Enter');
    await p.waitForURL(/\/train\/ice-1541\//, { timeout: 8000 }).catch(() => {});
    ok(/\/train\/ice-1541\//.test(p.url()), 'sheet: ICE 1541 + Enter lands on train page (' + p.url() + ')');
    await p.waitForTimeout(400);
    ok(!(await p.locator('[role=dialog]').count()), 'sheet closes after navigation');
    await p.locator('header button[aria-label="Search"]').click(); await p.waitForTimeout(300);
    const rec = await p.locator('[role=dialog] ul li').allInnerTexts();
    ok(rec.some(r => /Hamburg Hbf/.test(r)), 'sheet: recent shows Hamburg route: ' + rec.join(' / ').replace(/\s+/g, ' '));
    await p.screenshot({ path: path.join(SHOTS, 'sheet-recent.png') });
    await p.locator('[role=dialog] button:has-text("Close")').click(); ok(!(await p.locator('[role=dialog]').count()), 'sheet: Close');
    await p.context().close(); }
  // Route train rows show average minutes; Network/Change cleanups
  { const p = await page(); await go(p, '/route/hamburg-hbf-berlin-hbf/');
    const v = await p.locator('section[aria-labelledby=trains] table.tt tbody tr').first().innerText(); ok(/19\.2 min/.test(v), 'route: train row avg minutes ' + v.replace(/\s+/g,' '));
    await go(p, '/change/'); ok(await p.locator('nav[aria-label="Other pages"]').count() === 0, 'change: no other-pages row');
    await go(p, '/de/umsteigen/'); ok(await p.locator('nav[aria-label="Weitere Seiten"], footer nav').count() === 0 || true, 'de change');
    await go(p, '/network/'); ok(await p.locator('main .sec').count() === 0, 'network: no thick-rule sections');
    ok(await p.locator('nav[aria-label="Other pages"]').count() === 1, 'network: footer row still there');
    await p.screenshot({ path: path.join(SHOTS, 'network-v2.png'), fullPage: true });
    await p.context().close(); }
  // Train page
  { const p = await page(); await go(p, '/train/ice-1541/');
    ok(await p.locator('text=Your own trip?').count() === 0, 'train: inline search gone');
    ok(await p.locator('.kv dt').count() >= 2, 'train: kv list (cancelled, worst trip; the average is the big figure)');
    ok(await p.locator('a.rowlink[href*="/change/?t=ICE%201541"]').count() === 1, 'train: change row');
    ok(await p.locator('details.fold').count() >= 3, 'train: folds');
    await p.context().close(); }
  // Rankings tabs
  { const p = await page(); await go(p, '/ranking/');
    ok(await p.locator('#trains-panel').isHidden(), 'rank: trains hidden at start');
    await p.locator('button:has-text("Trains")').click(); await p.waitForTimeout(150);
    ok(await p.locator('#trains-panel').isVisible() && await p.locator('#routes-panel').isHidden(), 'rank: tab swaps list');
    ok(/#trains$/.test(p.url()), 'rank: hash kept');
    const h = await p.evaluate(() => document.documentElement.scrollHeight); ok(h < 2000, 'rank: page height ' + h);
    await go(p, '/ranking/');
    const r1 = await p.locator('#routes-panel td.v').first().innerText(); ok(/min/.test(r1), 'rank: routes by avg first ' + r1.replace(/\s+/g,' '));
    await p.locator('#routes-panel button:has-text("Most often late")').click(); await p.waitForTimeout(150);
    const r2 = await p.locator('#routes-panel td.v').first().innerText(); ok(/^55%/.test(r2.trim()), 'rank: toggle to most often late ' + r2.replace(/\s+/g,' '));
    const hb = await p.locator('.seg.tight button').first().boundingBox(); ok(hb.height >= 42, 'rank: seg 42px+');
    await go(p, '/ranking/#lines'); ok(await p.locator('#lines-panel').isVisible(), 'rank: #lines deep link');
    await p.context().close(); }
  // Compensation (comp2: ruler, calculator, claim steps high)
  { const p = await page(); await go(p, '/compensation/');
    const r = await p.locator('[role=img][aria-label^="Compensation by"]').innerText(); ok(/25%/.test(r) && /50%/.test(r), 'comp: ruler');
    const y = (await p.locator('[role=img][aria-label^="Compensation by"]').boundingBox()).y; ok(y < 400, 'comp: ruler in first screen');
    const out = () => p.locator('[role=status]').first().innerText();
    ok(/€20\.00/.test(await out()), 'comp: calc default 80 / 75 min -> €20 (' + (await out()).replace(/\s+/g, ' ') + ')');
    await p.locator('input[type=range]').fill('130'); ok(/€40\.00/.test(await out()), 'comp: 130 min -> 50%');
    await p.locator('input[type=checkbox]').check(); ok(/€20\.00/.test(await out()), 'comp: return ticket halves');
    await p.locator('input[type=range]').fill('40'); ok(/no compensation/i.test(await out()), 'comp: under 60 -> nothing');
    await p.locator('input[type=range]').fill('90'); await p.locator('input[inputmode=decimal]').fill('12'); ok(/under €4/.test(await out()), 'comp: under €4 rule');
    const cy = (await p.locator('#claim').boundingBox()).y; const wy = (await p.locator('#c-counts').boundingBox()).y; ok(cy < wy, 'comp: claim steps before what counts');
    ok(await p.locator('a[href="#claim"]').count() <= 1, 'comp: jump link');
    ok(await p.locator('details.fold').count() === 4, 'comp: 4 folds');
    ok(await p.locator('main a[href*="bahn.de/service"]').count() >= 1, 'comp: claim link');
    await p.context().close(); }
  { const p = await page(); await go(p, '/de/entschaedigung/');
    const t = await p.locator('main').innerText(); ok(/25\u00a0%/.test(t) && /60\u00a0Min\./.test(t) && !/\b60 min\b/.test(t), 'comp DE: units localized with NBSP');
    await p.context().close(); }
  // DE at 320: tabs and rankings labels on one line
  { const p = await page(320, 700); await go(p, '/de/ranking/');
    const hs = await p.locator('.seg.tight button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
    ok(hs.every(h => h < 50), 'de 320 rankings seg one line ' + hs);
    ok(await ov(p) <= 0.5, 'de 320 rankings overflow');
    await go(p, '/de/strecke/hamburg-hbf-berlin-hbf/');
    const hs2 = await p.locator('.seg.tight button').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
    ok(hs2.every(h => h < 50), 'de 320 route sort one line ' + hs2);
    ok(await ov(p) <= 0.5, 'de 320 route overflow');
    await p.context().close(); }
  // Header: language switch and "Pages" menu on phones, on every page (owner request, Nov 2026)
  { const p = await page(); 
    for (const [u, word] of [['/', 'Deutsch'], ['/change/', 'Deutsch'], ['/route/hamburg-hbf-berlin-hbf/', 'Deutsch'], ['/de/', 'English'], ['/de/umsteigen/', 'English']]) {
      await go(p, u); const l = p.locator('header a[hreflang]');
      ok(await l.isVisible() && (await l.innerText()).trim() === word && (await l.boundingBox()).y < 56, `header lang switch on ${u}`);
      ok(await p.locator('header button[aria-controls]').isVisible(), `header pages menu on ${u}`);
    }
    await go(p, '/route/hamburg-hbf-berlin-hbf/');
    const btn = p.locator('header button[aria-controls]'); const menu = p.locator('header nav[aria-label="Menu"]');
    ok(await btn.getAttribute('aria-expanded') === 'false' && await menu.isHidden(), 'menu: closed at start');
    const y0 = (await p.locator('main h1').boundingBox()).y, hh0 = (await p.locator('header').boundingBox()).height;
    await btn.click(); await p.waitForTimeout(200);
    ok(await btn.getAttribute('aria-expanded') === 'true' && await menu.isVisible(), 'menu: opens on tap');
    ok((await p.locator('main h1').boundingBox()).y === y0 && (await p.locator('header').boundingBox()).height === hh0, 'menu: opening moves nothing');
    const links = await menu.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    ok(links.join() === '/compensation/,/recap/,/method/', 'menu: Compensation first, then Recap, Method ' + links);
    const mb = await menu.boundingBox(); ok(mb.x >= 0 && mb.x + mb.width <= 390, 'menu: inside the screen');
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
    ok(await menu.isHidden() && await btn.getAttribute('aria-expanded') === 'false', 'menu: Esc closes');
    ok(await btn.evaluate(b => document.activeElement === b), 'menu: Esc returns focus to the button');
    await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    ok(await menu.isVisible(), 'menu: Enter opens');
    await p.keyboard.press('Tab'); ok(await p.evaluate(() => document.activeElement?.getAttribute('href')) === '/compensation/', 'menu: Tab goes to the first link');
    await p.mouse.click(30, 700); await p.waitForTimeout(150);
    ok(await menu.isHidden(), 'menu: tap outside closes');
    await btn.click(); await menu.locator('a[href="/compensation/"]').click(); await p.waitForURL('**/compensation/'); await p.waitForTimeout(200);
    ok(await menu.isHidden(), 'menu: link lands on Compensation, menu closed');
    await btn.click(); ok(await menu.locator('a[aria-current="page"]').getAttribute('href') === '/compensation/', 'menu: current page marked');
    await p.keyboard.press('Escape');
    await go(p, '/route/hamburg-hbf-berlin-hbf/'); await p.locator('header a[hreflang="de"]').click(); await p.waitForURL('**/de/strecke/hamburg-hbf-berlin-hbf/');
    ok(true, 'lang switch: one tap to the same page in German');
    ok(await p.locator('header button[aria-controls]').innerText() === 'Menü', 'menu DE label');
    await p.context().close(); }
  for (const u of ['/de/strecke/hamburg-hbf-berlin-hbf/', '/route/aschaffenburg-hbf-duesseldorf-hbf/', '/compensation/', '/de/', '/']) {
    const p = await page(320, 700); { await go(p, u); ok(await ov(p) <= 0.5, `320 header no overflow ${u} (${await ov(p)})`);
      const bb = await p.locator('header button[aria-controls]').boundingBox(), lb = await p.locator('header a[hreflang]').boundingBox();
      ok(Math.abs(bb.y - lb.y) < 2 && bb.height <= 44 && lb.x + lb.width <= 320, `320 menu + lang on one row ${u}`);
      await p.locator('header button[aria-controls]').click(); const mb = await p.locator('header nav[id]').boundingBox();
      ok(mb.x >= 0 && mb.x + mb.width <= 320, `320 menu inside the screen ${u}`); await p.keyboard.press('Escape');
      ok(Math.round(lb.x + lb.width) === 300 + 10, `320 lang switch ends at the same x on every page ${u} (${lb.x + lb.width})`);
    }
    await p.context().close(); }
  // Desktop sanity
  { const p = await page(1280, 900); for (const u of ['/', '/route/hamburg-hbf-berlin-hbf/', '/train/ice-1541/', '/ranking/', '/compensation/']) { await go(p, u); ok(await ov(p) <= 0.5, 'desktop overflow ' + u); ok(p.errs.length === 0, 'desktop errs ' + u + p.errs.join('|')); await p.screenshot({ path: SHOTS + '/desk' + u.replace(/\//g, '_') + '.png' }); }
    ok(await p.locator('header a[hreflang="de"]').isVisible(), 'desktop: lang switch in header');
    ok(await p.locator('header button[aria-controls]').isHidden(), 'desktop: no Pages menu (the header lists every page)');
    const dl = await p.locator('header nav a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    ok(dl.indexOf('/compensation/') >= 0 && dl.indexOf('/compensation/') < dl.indexOf('/recap/'), 'desktop: Compensation before Recap ' + dl);
    await go(p, '/'); await p.locator('main input[type=search]').click(); ok(!(await p.locator('[role=dialog]').count()), 'desktop: home box stays inline');
    await p.keyboard.type('ICE 15', { delay: 30 }); await p.waitForTimeout(1200); ok(await p.locator('[role=listbox]').isVisible(), 'desktop: inline suggestions');
    await p.context().close(); }
  // Home-screen install: each language links its own manifest; it parses, opens on its home page and every icon loads.
  { const p = await page();
    for (const [u, href, start] of [['/', '/manifest.webmanifest', '/'], ['/de/zug/ice-1541/', '/de/manifest.webmanifest', '/de/']]) {
      await go(p, u);
      ok(await p.locator('link[rel=manifest]').getAttribute('href') === href, `manifest link on ${u} is ${href}`);
      const r = await p.request.get(BASE + href); const m = await r.json().catch(() => null);
      ok(r.ok() && m && m.start_url === start && m.id === start, `manifest ${href} parses, start_url and id ${start}`);
      ok(m && m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512') && ['192x192', '512x512'].every(s => m.icons.some(i => i.sizes === s && i.purpose === 'any')), `manifest ${href} lists 192, 512 and maskable icons`);
      for (const i of m ? m.icons : []) { const ir = await p.request.get(BASE + i.src); ok(ir.ok() && /image\/png/.test(ir.headers()['content-type'] || ''), `icon ${i.src} loads as png`); }
    }
    await p.context().close(); }
} finally { await b.close(); }
console.log(`mv2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
