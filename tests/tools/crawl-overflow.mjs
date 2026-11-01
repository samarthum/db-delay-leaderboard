// Every page in out/sitemap.xml at 390 px: horizontal overflow and console errors. Needs the test server running.
//   node tests/tools/crawl-overflow.mjs [substring-filter]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE || 'http://127.0.0.1:4599';
const LAUNCH = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {};
const sm = fs.readFileSync(path.join(ROOT, 'out/sitemap.xml'), 'utf8');
let urls = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
if (process.argv[2]) urls = urls.filter((u) => u.includes(process.argv[2]));
let b, ctx; const bad = [], errs = [];
for (let n = 0; n < urls.length; n++) {
  // A fresh browser every 25 pages: one long-lived page crashes Chromium on a small machine.
  if (n % 25 === 0) { if (b) await b.close(); b = await chromium.launch({ ...LAUNCH, args: ['--font-render-hinting=none'] }); ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); }
  const p = await ctx.newPage(); const ce = [];
  p.on('console', (m) => m.type() === 'error' && ce.push(m.text().slice(0, 160))); p.on('pageerror', (e) => ce.push(String(e).slice(0, 160)));
  try {
    await p.goto(BASE + urls[n], { waitUntil: 'load', timeout: 20000 }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
    // Measure against visualViewport: under mobile emulation innerWidth grows with the overflow.
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.visualViewport.width);
    if (ov > 0.5) bad.push([urls[n], ov]); if (ce.length) errs.push([urls[n], ce[0]]);
  } catch (e) { errs.push([urls[n], 'ERR ' + e.message.slice(0, 80)]); }
  await p.close();
}
await b.close();
console.log(`crawl: ${urls.length} pages, overflow ${bad.length}, errors ${errs.length}`);
for (const x of [...bad, ...errs].slice(0, 30)) console.log(' ', ...x);
process.exit(bad.length || errs.length ? 1 : 0);
