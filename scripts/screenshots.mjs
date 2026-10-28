// Serves out/ and writes the review screenshots. Usage: node scripts/screenshots.mjs [outDir] [trainSlug]
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("out");
const shotsDir = path.resolve(process.argv[2] ?? "shots");
const train = process.argv[3] ?? "nj-40490";
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml", ".woff2": "font/woff2", ".ico": "image/x-icon" };

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

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1500);
}

async function percentMode(page) {
  await page.locator('[role="tab"]:has-text("%"), [role="radio"]:has-text("%")').first().click();
  await page.waitForTimeout(900);
}

async function mapShot(page, file) {
  await page.locator("#map").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector("#map").scrollIntoView({ block: "start" }));
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 }).catch(() => console.warn("map never reported ready"));
  await page.waitForTimeout(2500);
  await page.locator("#map").screenshot({ path: path.join(shotsDir, file) });
}

// isMobile stays off: mobile emulation widens the layout viewport to fit overflowing content and hides the overflow.
function overflowReport(page) {
  return page.evaluate(() => {
    const w = window.innerWidth;
    const wide = [...document.querySelectorAll("body *")]
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
  // Full-page captures above ~16k device px tile and repeat, so they are taken at 1x.
  const full = async (file) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.screenshot({ path: path.join(shotsDir, file), fullPage: true, scale: "css" });
  };
  await page.goto(`${base}/`);
  await settle(page);
  overflow.push(["home", await overflowReport(page)]);
  // The map goes first: a full-page capture stalls the software renderer past the map's load timeout.
  await mapShot(page, `${label}-map.png`);
  if (label === "mobile") {
    await page.locator("#leaderboard").screenshot({ path: path.join(shotsDir, "mobile-leaderboard.png") });
    await page.locator("#monthly").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await page.locator("#monthly").screenshot({ path: path.join(shotsDir, "mobile-monthly.png") });
  }
  await full(`${label}-home-full.png`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await percentMode(page);
  await full(`${label}-home-percent.png`);
  if (label === "mobile") await page.locator("#leaderboard").screenshot({ path: path.join(shotsDir, "mobile-leaderboard-percent.png") });
  await page.goto(`${base}/train/${train}/`);
  await settle(page);
  overflow.push(["train", await overflowReport(page)]);
  await full(`${label}-train.png`);
  console.log(label, "horizontal overflow:", JSON.stringify(overflow));
  await ctx.close();
}

await browser.close();
server.close();
