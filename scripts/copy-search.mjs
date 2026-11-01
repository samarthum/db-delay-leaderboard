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
  // Route search: trains from abroad get their real origin as a fifth field (index into `foreign`), so
  // "Amsterdam to Köln" finds ICE 221 boarding at its first German stop.
  const stops = JSON.parse(await fs.readFile(path.join(ROOT, "data", "stops.json"), "utf8"));
  let fo = {};
  try {
    fo = JSON.parse(await fs.readFile(path.join(ROOT, "data", "foreign-origins.json"), "utf8"));
  } catch {}
  for (const tr of stops.trains) {
    const o = fo[`${tr[0]} ${tr[1]}`];
    if (!o) continue;
    let i = stops.foreign.indexOf(o[0]);
    if (i < 0) i = stops.foreign.push(o[0]) - 1;
    while (tr.length < 4) tr.push(null);
    tr[4] = i;
  }
  await fs.writeFile(path.join(TO, "stops.json"), JSON.stringify(stops));
  console.log(`stops: ${((await fs.stat(path.join(TO, "stops.json"))).size / 1e6).toFixed(2)} MB copied`);
} catch {
  console.log("stops: data/stops.json not found, route search will be off (run scripts/stops.py)");
}

// Exact per-train numbers for every route that has a page (scripts/routes.py): search shows these for the same pair,
// so a search result and the route page never disagree. { slug: { l: late % of the route, n: measured trips,
// t: [[type, num, late %, measured], ...] } }
try {
  const routes = JSON.parse(await fs.readFile(path.join(ROOT, "data", "routes.json"), "utf8"));
  const table = {};
  for (const r of routes.routes) table[r.slug] = { l: r.late, a: r.avg, n: r.trips, t: r.list.filter((x) => (((x[3] - x[2]) % 1440) + 1440) % 1440 <= 720).map((x) => [x[0], x[1], x[4], x[5], x[6] ?? null, x[2], x[3]]) }; // rows running the other way are a data bug (ROADMAP)
  await fs.writeFile(path.join(TO, "routes.json"), JSON.stringify(table));
  console.log(`routes: ${Object.keys(table).length} routes written to public/search/routes.json`);
} catch {
  console.log("routes: data/routes.json not found, search will use its own numbers (run scripts/routes.py)");
}

// Connection odds by station (scripts/connections.py): the ladder of change times the home-page card shows.
try {
  await fs.copyFile(path.join(ROOT, "data", "connections.json"), path.join(TO, "connections.json"));
  console.log(`connections: ${((await fs.stat(path.join(TO, "connections.json"))).size / 1e3).toFixed(0)} kB copied`);
} catch {
  console.log("connections: data/connections.json not found, the connection card will show an error (run scripts/connections.py)");
}

// The station ladder split by the time of day of the next train (scripts/connections.py): the "typical change" guide offers it.
try {
  await fs.copyFile(path.join(ROOT, "data", "connections-daypart.json"), path.join(TO, "connections-daypart.json"));
  console.log(`connection dayparts: ${((await fs.stat(path.join(TO, "connections-daypart.json"))).size / 1e3).toFixed(0)} kB copied`);
} catch {
  console.log("connection dayparts: data/connections-daypart.json not found, the time-of-day choice will be unavailable");
}

// Train-to-train connection odds (scripts/connections.py): the "Change trains" page asks for the arriving and the next train.
try {
  await fs.copyFile(path.join(ROOT, "data", "connection-pairs.json"), path.join(TO, "connection-pairs.json"));
  console.log(`connection pairs: ${((await fs.stat(path.join(TO, "connection-pairs.json"))).size / 1e6).toFixed(2)} MB copied`);
} catch {
  console.log("connection pairs: data/connection-pairs.json not found, the Change trains flow will show an error (run scripts/connections.py)");
}

// Trains that come from abroad: their real first station (scripts/foreign_origins.mjs), so ICE 221 reads
// "Amsterdam Centraal → Frankfurt Hbf" and "Amsterdam" finds it.
let ORIGINS = {};
try {
  ORIGINS = JSON.parse(await fs.readFile(path.join(ROOT, "data", "foreign-origins.json"), "utf8"));
} catch {
  console.log("foreign origins: data/foreign-origins.json not found, trains from abroad start at the border");
}
// Record layout: [type, num, kind, runs, measured, avg, late, cancelled, weekday, origin, dest, worst, slug, hash, lineHash, line]
const trains = [];
for (const name of shards.sort()) {
  const rows = JSON.parse(await fs.readFile(path.join(FROM, name), "utf8"));
  for (const r of rows) {
    const [type, num, kind, , measured, avg, late, , , origin, dest] = r;
    if (kind === 2) continue; // 31k regional train numbers stay searchable by exact number, not by typeahead
    const hash = r[13] ?? null;
    const prefix = kind === 1 ? "line-" : "";
    const key = `${prefix}${type}-${num}${hash ? `.${hash}` : ""}`.toLowerCase();
    const realOrigin = kind === 0 && ORIGINS[`${type} ${num}`] ? ORIGINS[`${type} ${num}`][0] : origin;
    trains.push([type, num, kind, Math.round(late * 10) / 10, measured, realOrigin, dest, key, Math.round(avg * 10) / 10]);
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

// Last 7 days per train (scripts/last7.py, refreshed daily by .github/workflows/last7.yml): one committed file, split
// here by the first two digits of the number (as the search shards) so a card fetches ~1-2 kB, not the whole week.
// public/last7/index.json has the dates and the shard list; each shard {"ICE 123": {o, d, c}} has station names inline.
{
  const OUT = path.join(ROOT, "public", "last7");
  await fs.rm(OUT, { recursive: true, force: true });
  try {
    const week = JSON.parse(await fs.readFile(path.join(ROOT, "data", "last7.json"), "utf8"));
    const st = week.stations;
    const name = (i) => (i === null || i === undefined ? null : st[i]);
    const shards = {};
    for (const [unit, [o, d, cells]] of Object.entries(week.trains)) {
      const num = unit.split(" ")[1] ?? "";
      const key = (/^\d*/.exec(num)?.[0] ?? "").slice(0, 2) || "_"; // lib/searchCore.ts shardKey
      const c = cells.map((x) => (Array.isArray(x) && x.length > 2 ? [x[0], x[1], name(x[2]), name(x[3])] : x));
      (shards[key] ??= {})[unit] = { o: name(o), d: name(d), c };
    }
    await fs.mkdir(OUT, { recursive: true });
    let bytes = 0;
    for (const [key, trains] of Object.entries(shards)) {
      const body = JSON.stringify(trains);
      bytes += Buffer.byteLength(body);
      await fs.writeFile(path.join(OUT, `${key}.json`), body);
    }
    const index = { asOf: week.asOf, days: week.days, gaps: week.gaps, shards: Object.keys(shards).sort() };
    await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(index));
    console.log(`last7: ${Object.keys(week.trains).length} trains to ${week.asOf} in ${Object.keys(shards).length} shards (${(bytes / 1e3).toFixed(0)} kB) in public/last7`);
  } catch (e) {
    // An empty index (not a missing file): the browser would log a 404 as a console error on every train page.
    await fs.mkdir(OUT, { recursive: true });
    await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify({ asOf: null, days: [], gaps: {}, shards: [] }));
    console.log(`last7: data/last7.json not found or unreadable (${e.code ?? e.message}); the "last 7 days" block stays hidden`);
  }
}
