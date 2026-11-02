import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'test-results', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
// Playwright's own browser by default; set CHROMIUM=/path/to/chrome when the installed build differs.
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
// Trains from abroad: real origin on cards/pages, "Amsterdam Frankfurt" route search, border live.
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const txt = async () => (await p.locator('main').innerText()).replace(/\s+/g, ' ');
const go = async (u) => { await p.goto(BASE + u, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200); };
await go('/?q=ICE+221'); let t = await txt(); console.log(' ICE 221:', t.slice(60, 330));
ok(/Amsterdam Centraal → Frankfurt Hbf/.test(t), 'card shows real origin');
ok(/Starts in Amsterdam Centraal\. Our delay figures begin at Emmerich/.test(t), 'border note');
ok(/Next: |Today/.test(t), 'live line present');
await p.screenshot({ path: SHOTS + '/ice221.png' });
for (const q of ['Amsterdam to Frankfurt', 'Amsterdam Frankfurt', 'amsterdam köln', 'Wien München', 'Zürich to Hamburg']) {
  await go('/?r=1&q=' + encodeURIComponent(q)); t = await txt();
  const rows = await p.locator('[class*=option]').count();
  console.log(' ', q, '->', rows, 'rows |', t.slice(60, 260));
  ok(rows > 0 && !/Nothing found|aren't covered/.test(t), 'route from abroad: ' + q);
}
await go('/?r=1&q=' + encodeURIComponent('Amsterdam Frankfurt')); t = await txt();
ok(/ICE (121|221|105|123|125|127|129)/.test(t) && /Amsterdam Centraal/.test(t) && /Times abroad come from/.test(t), 'Amsterdam Frankfurt lists ICE 1x/2x boarding in Amsterdam, with the source footnote');
await go('/de/?q=ICE+221'); t = await txt(); console.log(' DE:', t.slice(60, 300));
ok(/Amsterdam Centraal → Frankfurt Hbf/.test(t) && /Startet in Amsterdam Centraal/.test(t), 'DE card');
await go('/?r=1&q=K%C3%B6ln+to+Berlin'); ok(/\/route\/koeln-hbf-berlin-hbf/.test(p.url()), 'normal route still opens its page ' + p.url());
ok(await p.evaluate(() => document.documentElement.scrollWidth - visualViewport.width) <= 0.5, 'no overflow');
ok(errs.length === 0, 'console ' + errs.join('|'));
await b.close(); console.log(`abroad: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
