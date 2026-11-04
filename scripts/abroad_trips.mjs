// For trains that start abroad (data/foreign-origins.json): find them in Transitous (https://transitous.org, open data
// from each country's railway) at their real first station, and store what the live API needs to find today's run fast:
//   data/abroad-trips.json  { "ICE 221": [originStopId, minutesFromOriginDepartureToFirstGermanStop] }
// The gap is taken against our own data's planned arrival at the first German stop (data/stops.json), so the live API
// can work out today's departure abroad from the German timetable it already knows. (Feeds abroad sometimes leave the
// border station out, e.g. the Dutch timetable has no Emmerich stop for ICE 221.)
// Run occasionally (trains not running today are kept from earlier runs; merge, never shrink).
//
//   node scripts/abroad_trips.mjs
//
// Transitous usage policy: light use, User-Agent with contact, attribution (on "How we measure"). This script makes about
// one request per origin plus one per train, 1.5 s apart.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const API = "https://api.transitous.org/api";
const UA = "zugmonitor/1.0 (+https://zugmonitor.de)";
const origins = JSON.parse(fs.readFileSync(path.join(ROOT, "data/foreign-origins.json"), "utf8"));
const stopsFile = JSON.parse(fs.readFileSync(path.join(ROOT, "data/stops.json"), "utf8"));
// The live API computes the run from data/live-trains.json (usual departure at the first German stop), so the gap is
// taken against that time: the departure abroad shown on the page then matches the foreign timetable exactly.
const liveTrains = JSON.parse(fs.readFileSync(path.join(ROOT, "data/live-trains.json"), "utf8"));
const firstArr = Object.fromEntries(stopsFile.trains.map((t) => {
  const k = `${t[0]} ${t[1]}`;
  const lt = liveTrains[k];
  return [k, lt ? lt[2].split(":").reduce((h, m) => +h * 60 + +m) : t[2][0][2]];
}));
const BERLIN = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockMin = (iso) => { const p = Object.fromEntries(BERLIN.formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
const outPath = path.join(ROOT, "data/abroad-trips.json");
const out = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

let last = 0;
async function get(p) {
  const wait = last + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const r = await fetch(API + p, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  return r.json();
}
const fold = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const RAIL = ["HIGHSPEED_RAIL", "LONG_DISTANCE", "NIGHT_RAIL"];

// Origin name -> stop id: the first long-distance rail stop the geocoder gives whose name matches.
const stopIds = {};
async function stopFor(name) {
  if (name in stopIds) return stopIds[name];
  const want = fold(name).slice(0, 8);
  const hits = await get(`/v1/geocode?type=STOP&text=${encodeURIComponent(name)}`);
  const s = hits.find((h) => h.type === "STOP" && (h.modes || []).some((m) => RAIL.includes(m)) && fold(h.name).startsWith(want.slice(0, 5))) || null;
  return (stopIds[name] = s ? s.id : null);
}

// Departures of the next 24 h at a stop, long-distance only (one call per origin).
const boards = {};
async function board(id) {
  if (!boards[id]) {
    const d = await get(`/v6/stoptimes?stopId=${encodeURIComponent(id)}&n=400&window=86400&mode=${RAIL.join(",")}`);
    boards[id] = d.stopTimes || [];
  }
  return boards[id];
}

let found = 0, noStop = 0, noRun = 0, noBorder = 0;
for (const [train, [origin, border]] of Object.entries(origins)) {
  const num = train.split(" ")[1];
  try {
    const id = await stopFor(origin);
    if (!id) { noStop++; continue; }
    const re = new RegExp(`(^|\\D)${num}$`);
    const cands = (await board(id)).filter((s) => re.test(String(s.tripShortName || "")) || re.test(String(s.displayName || "")));
    // Prefer a source with live data when the same train comes from two feeds.
    cands.sort((a, b) => Number(b.realTime) - Number(a.realTime));
    if (!cands.length) { noRun++; continue; }
    const arr = firstArr[train];
    if (arr === null || arr === undefined) { noBorder++; continue; }
    const gap = (((arr % 1440) - clockMin(cands[0].place.scheduledDeparture)) % 1440 + 1440) % 1440;
    if (gap < 5 || gap > 900) { noBorder++; continue; }
    out[train] = [id, gap];
    found++;
  } catch (e) {
    console.log("error", train, e.message);
  }
}
fs.writeFileSync(outPath, JSON.stringify(out) + "\n");
console.log(`abroad trips: found ${found}, origin stop unknown ${noStop}, not running in the next 24 h ${noRun}, no usable time gap ${noBorder}; file has ${Object.keys(out).length}`);
console.log("origins:", JSON.stringify(stopIds));
