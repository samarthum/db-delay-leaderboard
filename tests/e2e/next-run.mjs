import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Train not on now: search result (ICE 224, no own page) and a train page show the next planned run; live box when on.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
for (const [url, label] of [['/?q=ICE+224', 'search ICE 224'], ['/de/?q=ICE+224', 'DE search ICE 224'], ['/train/ice-1541/', 'page ICE 1541'], ['/?q=RE+5', 'regional: nothing']]) {
  await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  const n = await p.locator('.ln-next, .livenow').count();
  const txt = n ? (await p.locator('.ln-next, .livenow').first().innerText()).replace(/\s+/g, ' ') : '';
  console.log(' ', label, '->', txt || '(none)');
  if (label.startsWith('regional')) ok(n === 0, label); else ok(n === 1 && /Next|Nächste|Today|Heute/.test(txt), label);
  ok(await p.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, label + ' overflow');
  if (label === 'search ICE 224') await p.screenshot({ path: SHOTS + '/next.png' });
}
ok(errs.length === 0, 'console ' + errs.join('|'));
await b.close(); console.log(`next-run: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
