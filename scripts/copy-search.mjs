// Copies the search index written by compute.py (data/search/) to public/search/, where the browser fetches it,
// and builds the typeahead index (ta.json) from the long-distance and regional-line records.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FROM = path.join(ROOT, "data", "search");
const TO = path.join(ROOT, "public", "search");

await fs.rm(TO, { recursive: true, force: true });
await fs.mkdir(TO, { recursive: true });
let files = 0;
let bytes = 0;
const shards = [];
for (const name of await fs.readdir(FROM)) {
  // index.json is imported into the page bundle at build time; the browser only fetches shards and number lists.
  if (!/^(s|n)-.+\.json$/.test(name)) continue;
  await fs.copyFile(path.join(FROM, name), path.join(TO, name));
  bytes += (await fs.stat(path.join(FROM, name))).size;
  files += 1;
  if (name.startsWith("s-")) shards.push(name);
}
console.log(`search: ${files} files, ${(bytes / 1e6).toFixed(1)} MB copied to public/search`);

// Per-stop data for route search, written by scripts/stops.py.
try {
  await fs.copyFile(path.join(ROOT, "data", "stops.json"), path.join(TO, "stops.json"));
  console.log(`stops: ${((await fs.stat(path.join(TO, "stops.json"))).size / 1e6).toFixed(2)} MB copied`);
} catch {
  console.log("stops: data/stops.json not found, route search will be off (run scripts/stops.py)");
}

// Exact per-train numbers for every route that has a page (scripts/routes.py): search shows these for the same pair,
// so a search result and the route page never disagree. { slug: [[type, num, late %, measured], ...] }
try {
  const routes = JSON.parse(await fs.readFile(path.join(ROOT, "data", "routes.json"), "utf8"));
  const table = {};
  for (const r of routes.routes) table[r.slug] = r.list.map((x) => [x[0], x[1], x[4], x[5]]);
  await fs.writeFile(path.join(TO, "routes.json"), JSON.stringify(table));
  console.log(`routes: ${Object.keys(table).length} routes written to public/search/routes.json`);
} catch {
  console.log("routes: data/routes.json not found, search will use its own numbers (run scripts/routes.py)");
}

// Record layout: [type, num, kind, runs, measured, avg, late, cancelled, weekday, origin, dest, worst, slug, hash, lineHash, line]
const trains = [];
for (const name of shards.sort()) {
  const rows = JSON.parse(await fs.readFile(path.join(FROM, name), "utf8"));
  for (const r of rows) {
    const [type, num, kind, , measured, , late, , , origin, dest] = r;
    if (kind === 2) continue; // 31k regional train numbers stay searchable by exact number, not by typeahead
    const hash = r[13] ?? null;
    const prefix = kind === 1 ? "line-" : "";
    const key = `${prefix}${type}-${num}${hash ? `.${hash}` : ""}`.toLowerCase();
    trains.push([type, num, kind, Math.round(late * 10) / 10, measured, origin, dest, key]);
  }
}
trains.sort((a, b) => b[4] - a[4]);

// Stations that start or end a long-distance train. Regional lines would add thousands of small stops.
const byStation = new Map();
trains.forEach((t, i) => {
  if (t[2] !== 0) return;
  for (const s of [t[5], t[6]]) {
    if (!s) continue;
    if (!byStation.has(s)) byStation.set(s, []);
    const list = byStation.get(s);
    if (!list.includes(i)) list.push(i);
  }
});
const stations = [...byStation.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
const out = JSON.stringify({ trains, stations });
await fs.writeFile(path.join(TO, "ta.json"), out);
console.log(`typeahead: ${trains.length} trains and lines, ${stations.length} stations, ${(out.length / 1e3).toFixed(0)} kB`);
