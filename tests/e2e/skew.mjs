// Version skew: a tab opened on build A keeps working after the site is redeployed as build B (lib/deploy.ts).
//   node tests/e2e/skew.mjs                       # builds twice (next build only, ~1-2 min warm; share cards must
//                                                 # already be drawn by one `npm run build`), leaves out/ as build B
//   SKEW_A=dirA SKEW_B=dirB node tests/e2e/skew.mjs   # reuse two copied out/ folders
// Own server on :4612 that serves A, then B from the same address, like a Vercel deploy without skew protection
// (A's chunks are gone). Each tap must land on the intended address in build B (data-build on <html>), by a full page
// load and without a soft navigation attempt. Also: a soft navigation whose data request hangs ends as a full load
// (watchdog) and a normal tap stays a soft navigation with no version check.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};

function build(id) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gp-skew-${id}-`));
  const t = Date.now();
  execSync('npx next build', { cwd: ROOT, stdio: 'ignore', env: { ...process.env, GP_BUILD_ID: id } });
  fs.cpSync(path.join(ROOT, 'out'), dir, { recursive: true });
  console.log(`built ${id} into ${dir} in ${Math.round((Date.now() - t) / 1000)} s`);
  return dir;
}
const A = process.env.SKEW_A || build('skew-test-a');
const B = process.env.SKEW_B || build('skew-test-b');
const idOf = (dir) => fs.readFileSync(path.join(dir, 'version.txt'), 'utf8').trim();
const [ID_A, ID_B] = [idOf(A), idOf(B)];

let root = A;
let hangRsc = false;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) { res.setHeader('content-type', 'application/json'); return res.end('{"ok":false}'); }
  if (hangRsc && u.searchParams.has('_rsc')) return; // never answers: a stuck soft navigation
  let p = path.join(root, decodeURIComponent(u.pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('content-type', T[path.extname(p)] || 'application/octet-stream');
  res.end(fs.readFileSync(p));
});
await new Promise((r) => srv.listen(4612, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4612';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch(LAUNCH);
const RECENT = { en: [{ href: '/route/hamburg-hbf-berlin-hbf/', title: 'Hamburg Hbf → Berlin Hbf' }], de: [] };

async function open(w, start) {
  root = A; hangRsc = false;
  const mobile = w < 900;
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: mobile, hasTouch: mobile, locale: 'en-GB' });
  await ctx.addInitScript((r) => { try { if (!localStorage.getItem('gp-recent-v1')) localStorage.setItem('gp-recent-v1', JSON.stringify(r)); } catch {} }, RECENT);
  const p = await ctx.newPage();
  await p.clock.install();
  p.log = { rsc: 0, docs: [], version: 0, errs: [] };
  p.on('request', (r) => {
    const u = new URL(r.url());
    // Navigation data requests only: prefetches (next-router-prefetch) of a newer build are dropped by Next itself.
    if (u.searchParams.has('_rsc') && r.resourceType() !== 'document' && !r.headers()['next-router-prefetch']) p.log.rsc++;
    if (r.resourceType() === 'document') p.log.docs.push(u.pathname + u.search);
    if (u.pathname === '/version.txt') p.log.version++;
  });
  p.on('pageerror', (e) => p.log.errs.push(e.message));
  await p.goto(BASE + start, { waitUntil: 'networkidle' });
  ok(await p.getAttribute('html', 'data-build') === ID_A, `${w}px ${start}: opened on build A`);
  return p;
}
// The site was redeployed and the visitor comes back to the tab a while later.
async function deployAndReturn(p) {
  root = B;
  await p.clock.fastForward('02:00');
  p.log.rsc = 0; p.log.docs = []; p.log.version = 0;
  await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}
async function landed(p, re, what) {
  await p.waitForURL(re, { timeout: 15000 }).catch(() => {});
  await p.waitForLoadState('domcontentloaded');
  const build = await p.getAttribute('html', 'data-build').catch(() => null);
  ok(re.test(p.url()), `${what}: lands on ${re} (at ${p.url()})`);
  ok(build === ID_B, `${what}: shows build B (data-build ${build})`);
  ok(p.log.version === 1, `${what}: one version check (${p.log.version})`);
  ok(p.log.rsc === 0, `${what}: no soft navigation into the new build (${p.log.rsc} data requests)`);
  ok(p.log.docs.length === 1, `${what}: one full page load (${p.log.docs.join(', ')})`);
  await p.context().close();
}

const t0 = Date.now();
try {
  for (const w of [390, 1280]) {
    // A route link (Next <Link>) in a list.
    { const p = await open(w, '/routes/'); await deployAndReturn(p);
      const a = p.locator('main a[href^="/route/"]').nth(3); const href = await a.getAttribute('href');
      await a.click(); await landed(p, new RegExp(href.replace(/\//g, '\\/') + '$'), `${w}px route link`); }
    // Search suggestion (router.push in Search.tsx): from the home box, the sheet on phones.
    { const p = await open(w, '/'); await deployAndReturn(p);
      const box = p.locator('main input[type=search]');
      if (w < 900) { await box.tap(); await p.waitForTimeout(300); } else await box.click();
      await p.keyboard.type('Köln to Berlin', { delay: 30 }); await p.waitForTimeout(1500);
      await p.locator('[role=option]').first().click();
      await landed(p, /\/route\/koeln-hbf-berlin-hbf\/$/, `${w}px search suggestion`); }
  }
  // Phones: bottom tab and the sheet's recent list.
  { const p = await open(390, '/routes/'); await deployAndReturn(p);
    await p.locator('nav a[href="/ranking/"]').last().tap(); await landed(p, /\/ranking\/$/, '390px bottom tab'); }
  { const p = await open(390, '/routes/'); await deployAndReturn(p);
    await p.locator('header button[aria-label="Search"]').tap(); await p.waitForTimeout(300);
    await p.locator('[role=dialog] a[href="/route/hamburg-hbf-berlin-hbf/"]').tap();
    await landed(p, /\/route\/hamburg-hbf-berlin-hbf\/$/, '390px sheet recent list'); }
  // Phones: the header "Menu" dropdown. Desktop: the header links.
  { const p = await open(390, '/routes/'); await deployAndReturn(p);
    await p.locator('header button[aria-controls]').filter({ hasText: /menu/i }).first().tap();
    await p.locator('header nav[id] a[href="/method/"]').tap(); await landed(p, /\/method\/$/, '390px header menu'); }
  { const p = await open(1280, '/routes/'); await deployAndReturn(p);
    await p.locator('header a[href="/network/"]').first().click(); await landed(p, /\/network\/$/, '1280px header link'); }
  // A soft navigation that never gets its data ends as a full page load to the same address (watchdog).
  { const p = await open(390, '/routes/'); hangRsc = true; p.log.docs = [];
    const a = p.locator('main a[href^="/route/"]').nth(2); const href = await a.getAttribute('href');
    await a.click(); await p.waitForTimeout(500);
    ok(p.url() === BASE + '/routes/', 'hung soft navigation: still on the list while waiting');
    hangRsc = false; await p.clock.fastForward(9000);
    await p.waitForURL(BASE + href, { timeout: 10000 }).catch(() => {});
    ok(p.url() === BASE + href, `hung soft navigation: full load to ${href} (at ${p.url()})`);
    ok(p.log.docs.length === 1, `hung soft navigation: one full page load (${p.log.docs.join(', ')})`);
    await p.context().close(); }
  // Normal case: no deploy, the tap stays a soft navigation and nothing is checked.
  { const p = await open(390, '/routes/'); await p.clock.fastForward('02:00'); p.log.docs = []; p.log.version = 0;
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(300);
    const a = p.locator('main a[href^="/route/"]').nth(3); const href = await a.getAttribute('href');
    await a.click(); await p.waitForURL(BASE + href, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(500);
    ok(p.url() === BASE + href, `no deploy: lands on ${href}`);
    ok(p.log.docs.length === 0, `no deploy: soft navigation, no page load (${p.log.docs.join(', ')})`);
    ok(p.log.version === 1, `no deploy: the one check on return found the same build (${p.log.version})`);
    await p.clock.fastForward(9000); await p.waitForTimeout(300);
    ok(p.log.docs.length === 0, 'no deploy: watchdog stays quiet after a good navigation');
    ok(p.log.errs.length === 0, 'no deploy: no page errors ' + p.log.errs.join(' | '));
    await p.context().close(); }
} finally {
  await b.close(); srv.close();
}
console.log(`skew: ${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s of browser checks)`);
process.exit(fail ? 1 : 0);
