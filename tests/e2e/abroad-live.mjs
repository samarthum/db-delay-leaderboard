import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Live box shows the departure abroad (Transitous) for trains from abroad that run now.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const TRAINS = (process.env.TRAINS || 'ICE 74,RJX 60,RJ 88').split(',');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let shot = false;
for (const tr of TRAINS) for (const lang of ['', '/de']) {
  await p.goto(`${BASE}${lang}/?q=${encodeURIComponent(tr)}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const box = p.locator('.livenow');
  const t = (await box.count()) ? (await box.innerText()).replace(/\s+/g, ' ') : '(no box)';
  console.log(' ', tr, lang || 'en', '->', t);
  ok(await p.locator('.ln-abroad').count() === 1, `${tr}${lang}: abroad line`);
  ok(lang ? /\d\d:\d\d ab .+: (keine|\d)/.test(t) && /Transitous/.test(t) : /\d\d:\d\d from .+: (no |\d)/.test(t) && /Transitous/.test(t), `${tr}${lang}: wording + credit`);
  ok(!/undefined|NaN|null/.test(t), `${tr}${lang}: clean text`);
  ok(await p.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, `${tr}${lang}: overflow`);
  if (!shot) { await box.screenshot({ path: SHOTS + '/abroad-box.png' }); shot = true; }
}
ok(errs.length === 0, 'console ' + errs.join('|'));
await b.close(); console.log(`abroad-live: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
