// Every stop abroad of the trains that cross the border, both ways, from Transitous (https://transitous.org: the open
// timetables of each country's railway, merged). The open data the site's history comes from records only stops inside
// Germany, so ICE 221 seems to start at Emmerich and ICE 220 to end there; Utrecht, Arnhem, Liège or Salzburg did not
// exist at all.
//
//   node scripts/foreign_stops.mjs            # no key; GitHub Actions runs it weekly (.github/workflows/abroad.yml)
//
// For each train whose German part starts or ends at a border (data/stops.json: the first stop has an arrival, or the
// train ends abroad), it reads the long-distance departures of the next two days at that German stop (one call per stop
// and day), finds the train by its number near its usual time there, and reads that trip's full stop list (one call per
// train). Stops outside Germany are kept, each with its planned arrival and departure in minutes after the German
// anchor stop's planned departure (negative before it), so the site can place them before or after the German stops.
//
// Writes data/foreign-stops.json:
//   { "generatedAt", "stations": { "Utrecht Centraal": ["NL", transitousStopId] },
//     "trains": { "ICE 221": { "at": "Emmerich", "t": 1191, "seen": "2026-11-02",
//                              "s": [["Amsterdam Centraal", null, -183], ["Utrecht Centraal", -158, -153], ...] } } }
//   at = the German anchor stop (stops.json name), t = its usual planned departure there (minutes after midnight, Berlin),
//   aid = its Transitous stop id (api/live.js finds today's run there, then reads the whole trip),
//   s = stops abroad in running order: [name, arrival offset | null, departure offset | null].
// Trains not running in the next two days keep their last entry (merge, never shrink); a train found again is replaced.
//
// Transitous usage policy: light use, a User-Agent with contact, attribution (How we measure, README). This makes about
// 2 calls per border station and 1-2 per train, 1.5 s apart (~15 minutes).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const shared = createRequire(import.meta.url)("../lib/tripStops.cjs");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = process.env.TRANSITOUS_API || "https://api.transitous.org/api";
const UA = "german-punctuality/1.0 (+https://german-punctuality.vercel.app)";
const RAIL = ["HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL"];
const OUT = process.env.OUT || path.join(ROOT, "data/foreign-stops.json");
const LIMIT = Number(process.env.LIMIT || 0); // for a quick trial: only the first N trains

const stops = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stops.json"), "utf8"));
const outline = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/germany.json"), "utf8")).rings;
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { stations: {}, trains: {} };

const fold = shared.fold;

/** Inside Germany's outline (Natural Earth 1:50m), with ray casting over every ring. */
function inGermany(lat, lon) {
  let inside = false;
  for (const ring of outline)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

// UIC country codes as DELFI writes them in foreign stop ids (de-DELFI_0000084xxxxx = a Dutch station).
const UIC = { 80: "DE", 81: "AT", 82: "LU", 83: "IT", 84: "NL", 85: "CH", 86: "DK", 87: "FR", 88: "BE", 54: "CZ", 51: "PL", 55: "HU", 74: "SE", 76: "NO", 78: "HR", 79: "SI", 56: "SK", 71: "ES", 70: "GB" };
// Coarse boxes as a last resort when an id names no country (checked in order; neighbours first).
const BOXES = [
  ["NL", 50.75, 53.7, 3.3, 7.25], ["BE", 49.5, 51.5, 2.5, 6.4], ["LU", 49.44, 50.19, 5.73, 6.53], ["CH", 45.8, 47.81, 5.95, 10.5],
  ["AT", 46.37, 49.02, 9.53, 17.17], ["CZ", 48.55, 51.06, 12.09, 18.86], ["PL", 49.0, 54.84, 14.12, 24.15], ["DK", 54.55, 57.75, 8.0, 15.2],
  ["FR", 42.3, 51.1, -4.8, 8.25], ["IT", 36.6, 47.1, 6.6, 18.5], ["HU", 45.74, 48.59, 16.11, 22.9], ["SE", 55.3, 69.1, 11.0, 24.2],
  ["SI", 45.42, 46.88, 13.37, 16.6], ["HR", 42.4, 46.55, 13.5, 19.45], ["SK", 47.73, 49.61, 16.83, 22.57],
];
function countryOf(stopId, lat, lon) {
  const m = /DELFI_0*(\d{2})\d{5}$/.exec(stopId);
  if (m && UIC[m[1]] && UIC[m[1]] !== "DE") return UIC[m[1]];
  const p = /^([a-z]{2})-/.exec(stopId);
  const byBox = BOXES.find(([, a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);
  if (byBox) return byBox[0];
  return p && p[1] !== "de" && p[1] !== "eu" ? p[1].toUpperCase() : null;
}

let last = 0;
let calls = 0;
async function get(p) {
  const wait = last + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  calls++;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(API + p, { headers: { "User-Agent": UA, Accept: "application/json" } }).catch((e) => ({ ok: false, status: String(e) }));
    if (r.ok) return r.json();
    if (r.status !== 429 && !(Number(r.status) >= 500)) throw new Error(`${r.status} ${p}`);
    await new Promise((res) => setTimeout(res, 10000 * (attempt + 1)));
  }
  throw new Error(`gave up ${p}`);
}

const BERLIN = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockMin = (iso) => {
  const p = Object.fromEntries(BERLIN.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return +p.hour * 60 + +p.minute;
};
const gapMin = (a, b) => Math.min(Math.abs(a - b) % 1440, 1440 - (Math.abs(a - b) % 1440));

// German stop name -> Transitous stop id: the rail stop inside Germany whose name shares the most words with ours
// ("Frankfurt (Oder)" must not become Frankfurt (Main)).
const stopIds = {};
const wordsOf = (s) => String(s).toLowerCase().replace(/ß/g, "ss").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/hauptbahnhof/g, "hbf").split(/[^a-z0-9]+/).filter(Boolean);
async function stopFor(name) {
  if (name in stopIds) return stopIds[name];
  const hits = await get(`/v1/geocode?type=STOP&text=${encodeURIComponent(name.replace(/[()]/g, " "))}`);
  const want = wordsOf(name);
  let best = null;
  for (const h of hits) {
    if (h.type !== "STOP" || !(h.modes || []).some((m) => RAIL.includes(m)) || !inGermany(h.lat, h.lon)) continue;
    const have = wordsOf(h.name);
    if (have[0] !== want[0]) continue;
    const score = want.filter((w) => have.includes(w)).length - 0.01 * have.length;
    if (!best || score > best.score) best = { id: h.id, score };
  }
  return (stopIds[name] = best ? best.id : null);
}

// Long-distance departures at a stop over the next two days (two calls, cached per stop).
const boards = {};
async function board(id) {
  if (!boards[id]) {
    const list = [];
    for (const k of [0, 1]) {
      const time = new Date(Date.now() + k * 86400e3).toISOString();
      const d = await get(`/v6/stoptimes?stopId=${encodeURIComponent(id)}&time=${time}&n=600&window=86400&mode=${RAIL.join(",")}`);
      list.push(...(d.stopTimes || []));
    }
    boards[id] = list;
  }
  return boards[id];
}

function placesOf(trip) {
  const leg = (trip.legs || [])[0];
  if (!leg) return [];
  return [leg.from, ...(leg.intermediateStops || []), leg.to].filter(Boolean);
}

/** The trains to look up: those that come from abroad (first German stop has an arrival) or end abroad. */
function candidates() {
  const out = [];
  for (const [tt, num, st, fi] of stops.trains) {
    const first = st[0];
    const fromAbroad = first[2] !== null && first[3] >= 20;
    const toAbroad = fi !== undefined && fi !== null;
    if (!fromAbroad && !toAbroad) continue;
    // Anchors: German stops near the border side, tried in turn (feeds abroad and DELFI leave some border stops out:
    // ICE 221 passes Emmerich without a stop in the timetable). A train through Germany is looked up from its start.
    const side = fromAbroad ? st.slice(0, 4) : st.slice(-4).reverse();
    const anchors = side.filter((s) => (s[1] ?? s[2]) !== null).map((s) => ({ name: stops.stations[s[0]], t: s[1] ?? s[2], off: s[8] }));
    out.push({ name: `${tt} ${num}`, tt, num, anchors, german: new Set(st.map((s) => fold(stops.stations[s[0]]))) });
  }
  return out;
}

const germanNames = new Set(stops.stations.map(fold));
const LABELS = stops.foreign || [];
const canonical = (name) => shared.canonical(name, LABELS);
const stations = { ...(old.stations || {}) };
const trains = { ...(old.trains || {}) };
const today = new Date().toISOString().slice(0, 10);
let found = 0, noStop = 0, noRun = 0, onlyGerman = 0, failed = 0;
const list = candidates();
for (const c of LIMIT ? list.slice(0, LIMIT) : list) {
  try {
    const re = new RegExp(`(^|\\D)${c.num}$`);
    let best = null;
    let anchor = null;
    let anyStop = false;
    for (const a of c.anchors) {
      const id = await stopFor(a.name);
      if (!id) continue;
      anyStop = true;
      const cands = (await board(id))
        .filter((s) => (re.test(String(s.tripShortName || "")) || re.test(String(s.displayName || ""))) && s.place && s.place.scheduledDeparture)
        .filter((s) => gapMin(clockMin(s.place.scheduledDeparture), a.t) <= 40);
      if (!cands.length) continue;
      // The same train can come from two feeds (DELFI and the neighbour's own): read up to two, keep the longest trip.
      const seenTrip = new Set();
      for (const s of cands) {
        if (seenTrip.has(s.tripId) || seenTrip.size >= 2) continue;
        seenTrip.add(s.tripId);
        const places = placesOf(await get(`/v6/trip?tripId=${encodeURIComponent(s.tripId)}`));
        if (!best || places.length > best.places.length) best = { places, board: s, id };
      }
      anchor = a;
      break;
    }
    if (!best) { if (anyStop) noRun++; else noStop++; continue; }
    c.anchor = anchor.name;
    c.t = anchor.t;
    const places = best.places;
    // Offsets count from the anchor's planned departure as the board gave it (the trip's own copy of that stop may sit
    // under another stop id or name spelling).
    const base = Date.parse(best.board.place.scheduledDeparture) / 60000;
    const abroad = [];
    for (const p of places) {
      if (c.german.has(fold(p.name)) || germanNames.has(fold(p.name)) || inGermany(p.lat, p.lon)) continue;
      const cc = countryOf(p.stopId || "", p.lat, p.lon);
      if (!cc) continue;
      const off = (iso) => (iso ? Math.round(Date.parse(iso) / 60000 - base) : null);
      const arr = p === places[0] ? null : off(p.scheduledArrival);
      const dep = p === places[places.length - 1] ? null : off(p.scheduledDeparture);
      if (arr === null && dep === null) continue;
      const name = canonical(p.name);
      abroad.push([name, arr, dep]);
      // The id the latest trip gave (ids change with feed versions).
      stations[name] = [cc, p.stopId];
    }
    if (!abroad.length) { onlyGerman++; continue; }
    trains[c.name] = { at: c.anchor, t: c.t, aid: best.id, seen: today, s: abroad };
    found++;
  } catch (e) {
    failed++;
    console.log("error", c.name, e.message);
  }
}
const doc = { generatedAt: new Date().toISOString(), source: "Transitous (transitous.org), timetables of each country's railway", stations: Object.fromEntries(Object.entries(stations).sort()), trains: Object.fromEntries(Object.entries(trains).sort()) };
fs.writeFileSync(OUT, JSON.stringify(doc) + "\n");
const byCc = {};
for (const t of Object.values(trains)) for (const [n] of t.s) byCc[stations[n]?.[0]] = (byCc[stations[n]?.[0]] || 0) + 1;
console.log(`foreign stops: ${list.length} trains asked, found ${found}, anchor stop unknown ${noStop}, not running in the next 2 days ${noRun}, no stop abroad ${onlyGerman}, errors ${failed}; file has ${Object.keys(trains).length} trains, ${Object.keys(stations).length} stations abroad; ${calls} calls`);
console.log("train-stops by country:", JSON.stringify(byCc));
console.log("anchor ids:", JSON.stringify(stopIds));
