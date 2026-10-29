// Serves out/ and writes the review screenshots. Usage: node scripts/screenshots.mjs [outDir] [trainSlug] [lineSlug]
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const shotsDir = path.resolve(process.argv[2] ?? "shots");
const stats = JSON.parse(readFileSync(path.resolve("data/stats.json"), "utf8"));
const train = process.argv[3] ?? stats.rankings.longDistance.minutes[0].slug;
const line = process.argv[4] ?? stats.rankings.regional.minutes[0].slug;
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };

const server = createServer(async (req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = path.join(p, "index.html");
  try {
    const body = await readFile(p);
    res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
await mkdir(shotsDir, { recursive: true });

const browser = await chromium.launch();

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(800);
}

// isMobile stays off: mobile emulation widens the layout viewport to fit overflowing content and hides the overflow.
function overflowReport(page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => !el.closest(".visually-hidden"))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && r.right > w + 1)
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 6)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} right=${Math.round(r.right)}`);
    return { overflowPx: document.documentElement.scrollWidth - w, wide };
  });
}

for (const [label, viewport, dsf] of [["mobile", { width: 390, height: 844 }, 2], ["desktop", { width: 1440, height: 900 }, 1]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dsf, hasTouch: label === "mobile" });
  const page = await ctx.newPage();
  const overflow = [];
  const shot = (file, opts = {}) => page.screenshot({ path: path.join(shotsDir, file), scale: "css", ...opts });

  await page.goto(`${base}/`);
  await settle(page);
  overflow.push(["home", await overflowReport(page)]);
  await shot(`${label}-home-top.png`);
  await shot(`${label}-home-full.png`, { fullPage: true });
  await page.locator("#map").screenshot({ path: path.join(shotsDir, `${label}-map.png`), scale: "css" });
  await page.locator('[role="tab"]:has-text("Regional")').last().click();
  await page.waitForTimeout(500);
  await page.locator("#leaderboard").screenshot({ path: path.join(shotsDir, `${label}-leaderboard-regional.png`), scale: "css" });
  await page.locator('[role="tab"]:has-text("%")').click();
  await page.waitForTimeout(500);
  await page.locator("#leaderboard").screenshot({ path: path.join(shotsDir, `${label}-leaderboard-regional-percent.png`), scale: "css" });

  for (const [name, href] of [["train", `/train/${train}/`], ["line", `/line/${line}/`]]) {
    await page.goto(`${base}${href}`);
    await settle(page);
    overflow.push([name, await overflowReport(page)]);
    await shot(`${label}-${name}.png`, { fullPage: true });
  }
  console.log(label, "horizontal overflow:", JSON.stringify(overflow));
  await ctx.close();
}

await browser.close();
server.close();
