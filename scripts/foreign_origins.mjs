// Where trains that enter Germany really start. The open data records only German stops, so ICE 221 seems to start at
// Emmerich. DB's Timetables API lists, for each arrival, the planned path before it ("ppth"): its first entry is the
// real origin (Amsterdam Centraal).
//
//   node scripts/foreign_origins.mjs            # needs DB_CLIENT_ID / DB_API_KEY (env, DB_ENV_FILE or .env.local)
//
// Reads data/stops.json (trains whose first recorded stop has an arrival = they come from somewhere) and the raw EVA
// of that stop (data/border-stations.json, written by scripts/border_stations.py). Writes data/foreign-origins.json:
//   { "ICE 221": ["Amsterdam Centraal", "Emmerich"] }   (real origin abroad, first German stop as the data names it)
// Only origins that are not German stations of the data are kept. Trains not running today or tomorrow at that hour are
// retried on the next run of the script; the old entry is kept (merge, never shrink).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
// Keys: DB_CLIENT_ID / DB_API_KEY from the environment, else from the file named by DB_ENV_FILE, else .env.local.
const envFile = process.env.DB_ENV_FILE || path.join(ROOT, ".env.local");
if (!process.env.DB_API_KEY && fs.existsSync(envFile))
  for (const l of fs.readFileSync(envFile, "utf8").split("\n")) {
    const i = l.indexOf("=");
    if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1).trim();
  }
const BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";
const stops = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stops.json"), "utf8"));
const border = JSON.parse(fs.readFileSync(path.join(ROOT, "data/border-stations.json"), "utf8"));
const outPath = path.join(ROOT, "data/foreign-origins.json");
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
const german = new Set(stops.stations.map((s) => fold(s)));
function fold(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

const cache = new Map();
let last = 0;
async function plan(eva, day, hour) {
  const k = `${eva}/${day}/${hour}`;
  if (cache.has(k)) return cache.get(k);
  const wait = last + 1250 - Date.now(); // 48 calls a minute, under the free plan's 60
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(`${BASE}/plan/${k}`, { headers: { "DB-Client-Id": process.env.DB_CLIENT_ID, "DB-Api-Key": process.env.DB_API_KEY, Accept: "application/xml", "User-Agent": "german-punctuality.vercel.app" } });
  const x = r.ok ? await r.text() : "";
  cache.set(k, x);
  return x;
}
const unent = (v) => v.replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit" });
const dayOf = (ms) => Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
const days = [0, 1].map((k) => { const p = dayOf(Date.now() + k * 86400e3); return `${p.year}${p.month}${p.day}`; });

let asked = 0, found = 0, notRunning = 0, domestic = 0;
for (const [tt, num, st] of stops.trains) {
  const first = st[0];
  if (first[2] === null || first[3] < 20) continue; // starts in Germany (no arrival at its first stop) or too rare
  const name = stops.stations[first[0]];
  const eva = border[name];
  if (!eva) continue;
  asked++;
  const arr = ((first[2] % 1440) + 1440) % 1440;
  let ppth = null;
  for (const day of days) {
    for (const h of new Set([Math.floor(arr / 60), Math.floor(((arr + 1439) % 1440) / 60), Math.floor(((arr + 1) % 1440) / 60)])) {
      const x = await plan(eva, day, String(h).padStart(2, "0"));
      for (const m of x.matchAll(/<s id="[^"]+"[^>]*>([\s\S]*?)<\/s>/g)) {
        if (!new RegExp(`<tl [^>]*c="${tt}"`).test(m[1]) || !new RegExp(`<tl [^>]*n="${num}"`).test(m[1])) continue;
        const ar = m[1].match(/<ar [^>]*ppth="([^"]*)"/);
        if (ar) ppth = unent(ar[1]).split("|");
      }
      if (ppth) break;
    }
    if (ppth) break;
  }
  if (!ppth) { notRunning++; continue; }
  const origin = ppth[0];
  if (german.has(fold(origin))) { domestic++; continue; }
  out[`${tt} ${num}`] = [origin, name];
  found++;
}
fs.writeFileSync(outPath, JSON.stringify(out, null, 0) + "\n");
console.log(`foreign origins: asked ${asked}, found abroad ${found}, start in Germany ${domestic}, not running today/tomorrow ${notRunning}; file has ${Object.keys(out).length}`);
