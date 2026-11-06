// Vercel Function. Live status for one route page: the long-distance trains that leave station A for station B in the
// next two hours, with the delay DB expects at A and at B. It asks DB's Timetables API (CC BY 4.0), so the API key never
// reaches the browser and visitors never call DB themselves.
//
//   GET /api/live/?from=K%C3%B6ln%20Hbf&to=Berlin%20Hbf     (names exactly as on the site; see data/live-stations.json)
//
// Limits: DB's Free plan allows 60 calls a minute. Three layers keep a busy site far below that:
//   1. the CDN caches each answer for 45 s (Cache-Control s-maxage), so all visitors of one route share one fetch
//      (no stale-while-revalidate: browsers would then re-fetch in the background and show data up to 90 s old);
//   2. this instance keeps the timetable of an hour for 20 min and the changes of a station for 45 s, shared by routes;
//   3. a ceiling of 40 calls a minute per instance; past it the answer is "busy" and the page says live data is unavailable.
// Only stations listed in data/live-stations.json are accepted, so the endpoint cannot be used to look up anything else.
//
// Needs LIVE_ENABLED=1, DB_CLIENT_ID and DB_API_KEY in the project's environment variables. Without them it answers
// 200 {ok:false, error:"disabled"} and the page shows no live block (a 4xx would show up in every visitor's console).

const STATIONS = require("../data/live-stations.json");

const BASE = process.env.LIVE_UPSTREAM || "https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1";
const LONG = new Set(["ICE", "IC", "EC", "ECE", "RJ", "RJX", "TGV", "FLX"]);
const WINDOW_MIN = 120; // how far ahead the page looks
const BACK_MIN = 2; // a train that left a moment ago still shows
const MAX_ROWS = 6;
const CALLS_PER_MINUTE = 40;

const norm = (s) => String(s).toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]/g, "");

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", cache || "no-store");
  res.end(JSON.stringify(body));
}

// ---- time: DB writes local time as yyMMddHHmm ---------------------------------------------------------------------
const FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function stampOf(ms) {
  const p = {};
  for (const x of FMT.formatToParts(new Date(ms))) p[x.type] = x.value;
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}`;
}
const minutesOf = (s) => Date.UTC(2000 + Number(s.slice(0, 2)), Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10))) / 60000;
const diff = (a, b) => (a && b ? Math.round(minutesOf(b) - minutesOf(a)) : null);

// ---- a tiny reader for the API's regular XML --------------------------------------------------------------------
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unent = (v) => v.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()]));
function attrs(text) {
  const out = {};
  for (const m of text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = unent(m[2] ?? m[3] ?? "");
  return out;
}
function services(xml) {
  const out = [];
  for (const m of xml.matchAll(/<s\s([^>]*?)(?:\/>|>([\s\S]*?)<\/s>)/g)) {
    const a = attrs(m[1]);
    const body = m[2] || "";
    const tag = (name) => {
      const t = body.match(new RegExp(`<${name}\\b([^>]*?)\\/?>`));
      return t ? attrs(t[1]) : null;
    };
    out.push({ id: a.id, tl: tag("tl"), ar: tag("ar"), dp: tag("dp") });
  }
  return out;
}
const tripKey = (id) => id.replace(/-\d+$/, "");

// ---- DB, with caches and a call ceiling -----------------------------------------------------------------------
const cache = new Map();
let calls = [];
let busyUntil = 0;

function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = load().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 400) for (const [k, v] of cache) if (Date.now() - v.at > 20 * 60000) cache.delete(k);
  return value;
}

async function upstream(path) {
  const now = Date.now();
  if (now < busyUntil) throw new Error("busy");
  calls = calls.filter((t) => now - t < 60000);
  if (calls.length >= CALLS_PER_MINUTE) throw new Error("busy");
  calls.push(now);
  const r = await fetch(BASE + path, {
    headers: { "DB-Client-Id": process.env.DB_CLIENT_ID, "DB-Api-Key": process.env.DB_API_KEY, Accept: "application/xml", "User-Agent": "zugmonitor.de" },
    signal: AbortSignal.timeout(4000),
  });
  if (r.status === 429) {
    busyUntil = Date.now() + 30000;
    throw new Error("busy");
  }
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.text();
}

const plan = (eva, hourStamp) => cached(`p:${eva}:${hourStamp}`, 20 * 60000, async () => services(await upstream(`/plan/${eva}/${hourStamp.slice(0, 6)}/${hourStamp.slice(6, 8)}`)));
const changes = (eva) => cached(`c:${eva}`, 45000, async () => services(await upstream(`/fchg/${eva}`)));

// ---- the answer -------------------------------------------------------------------------------------------------
async function board(from, to) {
  const nowMs = Date.now();
  const nowStamp = stampOf(nowMs);
  const nowMin = minutesOf(nowStamp);
  // One hour back as well: a train planned an hour ago and now 60+ minutes late still leaves inside the window.
  const hours = [-1, 0, 1, 2].map((h) => stampOf(nowMs + h * 3600000));
  const [plans, fchgFrom, fchgTo] = await Promise.all([Promise.all(hours.map((h) => plan(from.eva, h))), changes(from.eva), changes(to.eva)]);
  const want = norm(to.name);
  const chgFrom = new Map(fchgFrom.map((s) => [tripKey(s.id), s]));
  const chgTo = new Map(fchgTo.map((s) => [tripKey(s.id), s]));
  const seen = new Set();
  const rows = [];
  for (const s of plans.flat()) {
    if (!s.tl || !LONG.has(s.tl.c) || !s.dp || !s.dp.pt || s.dp.hi === "1" || seen.has(s.id)) continue;
    seen.add(s.id);
    if (!(s.dp.ppth || "").split("|").some((p) => norm(p) === want)) continue;
    const key = tripKey(s.id);
    const cf = chgFrom.get(key);
    const pd = s.dp.pt;
    const cd = cf && cf.dp && cf.dp.ct ? cf.dp.ct : null;
    const canc = Boolean(cf && cf.dp && cf.dp.cs === "c") || Boolean(s.dp.cs === "c");
    const when = minutesOf(cd || pd);
    if (when < nowMin - BACK_MIN || when > nowMin + WINDOW_MIN) continue;
    const ct = chgTo.get(key);
    rows.push({
      cat: s.tl.c,
      n: s.tl.n,
      pd,
      cd,
      plat: (cf && cf.dp && cf.dp.cp) || s.dp.pp || null,
      platChanged: Boolean(cf && cf.dp && cf.dp.cp && s.dp.pp && cf.dp.cp !== s.dp.pp),
      canc,
      ca: ct && ct.ar && ct.ar.ct ? ct.ar.ct : null,
      arrCanc: Boolean(ct && ct.ar && ct.ar.cs === "c"),
      key,
    });
  }
  // Planned time, like a departure board: the time column shows the planned departure and the status says how late.
  rows.sort((a, b) => minutesOf(a.pd) - minutesOf(b.pd));
  const shown = rows.slice(0, MAX_ROWS);
  // The planned arrival at B comes from B's timetable, for the hour the predicted arrival falls in and the two before it
  // (a train is never more than two hours late into a station and still on this list). Stamps are local wall-clock time,
  // read as if UTC, so whole-hour arithmetic on them is exact.
  const hourStamps = new Set();
  for (const r of shown) {
    if (!r.ca) continue;
    const base = minutesOf(r.ca.slice(0, 8) + "00");
    for (const back of [0, 1, 2]) {
      const d = new Date((base - back * 60) * 60000);
      const p2 = (n) => String(n).padStart(2, "0");
      hourStamps.add(`${String(d.getUTCFullYear()).slice(2)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}00`);
    }
  }
  const arrivals = new Map();
  if (hourStamps.size) {
    const toPlans = await Promise.all([...hourStamps].map((h) => plan(to.eva, h)));
    for (const s of toPlans.flat()) if (s.ar && s.ar.pt) arrivals.set(tripKey(s.id), s.ar.pt);
  }
  return {
    asOf: nowStamp,
    trains: shown.map((r) => {
      const pa = r.ca ? arrivals.get(r.key) || null : null;
      return {
        cat: r.cat,
        n: r.n,
        pd: r.pd,
        late: r.canc ? null : Math.max(0, diff(r.pd, r.cd) ?? 0),
        canc: r.canc,
        plat: r.plat,
        platChanged: r.platChanged,
        pa,
        lateArr: r.arrCanc || r.canc || !pa ? null : Math.max(0, diff(pa, r.ca)),
        arrCanc: r.arrCanc && !r.canc,
      };
    }),
  };
}

// ---- one train: today's run of a train page's train, from its first to its last station ------------------------------
// data/live-trains.json: "ICE 1541" -> [originEva, originName, "HH:MM", destEva, destName, "HH:MM", weekdayBits, minutes]
// (scripts/live_trains.py: the usual run in the last two months). The run is looked up in the origin's timetable for the
// hour it leaves, then the changes at both ends give the delay DB reports now.
const TRAINS = require("../data/live-trains.json");
// Trains that start abroad: [Transitous stop id of the real origin, minutes from leaving it to the first German stop]
// (scripts/abroad_trips.mjs) and the origin's name (scripts/foreign_origins.mjs).
const ABROAD = require("../data/abroad-trips.json");
const ORIGINS = require("../data/foreign-origins.json");
const TRANSITOUS = process.env.TRANSITOUS_UPSTREAM || "https://api.transitous.org/api";
const TRANSITOUS_PER_MINUTE = 20;
let tCalls = [];
const BEFORE_MIN = 180; // show a run this long before it leaves
const AFTER_MIN = 90; // and until this long after its planned arrival

const p2 = (n) => String(n).padStart(2, "0");
/** Minutes since 2000 (as minutesOf) back to a yyMMddHHmm stamp. */
function stampAt(min) {
  const d = new Date(min * 60000);
  return `${String(d.getUTCFullYear()).slice(2)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
}

/** All variants of a train number: the main one, then the others (items 0-7 each; see scripts/live_trains.py). */
const variantsOf = (e) => [e.slice(0, 8), ...(e[8] || [])];
const weekdayOf = (day) => (new Date(day * 60000).getUTCDay() + 6) % 7; // Monday = 0

/**
 * The runs of this train number (today's or yesterday's start) that are on now, one per distinct origin + departure
 * time, nearest to leaving first. A number often runs to different last stations on different days, so the stations
 * of a run come from DB's own trip (trainNow), not from the variant. `lead`: minutes it runs abroad first.
 */
function runsNow(e, nowMin, lead = 0) {
  const found = new Map();
  const today = Math.floor(nowMin / 1440) * 1440;
  // A train from abroad: `lead` was measured against the main variant's departure, so only that origin and time count.
  const vs = variantsOf(e).filter((v) => !lead || (v[0] === e[0] && v[2] === e[2]));
  for (const v of vs) {
    const [, , dep, , , , days, mins] = v;
    const [h, m] = dep.split(":").map(Number);
    for (const day of [today, today - 1440]) {
      const start = day + h * 60 + m;
      if (!((days >> weekdayOf(day)) & 1)) continue;
      if (nowMin >= start - lead - BEFORE_MIN && nowMin <= start + mins + AFTER_MIN) {
        const k = `${v[0]}|${start}`;
        const cur = found.get(k);
        if (!cur) found.set(k, { start, end: start + mins, ends: mins, origin: v });
        else cur.ends = Math.max(cur.ends, mins);
      }
    }
  }
  return [...found.values()].sort((x, y) => Math.abs(x.start - nowMin) - Math.abs(y.start - nowMin)).map((r) => ({ ...r, end: r.start + r.ends }));
}

/** The next planned start of this train after now (from the usual timetable; no call to DB), within a week. */
function nextStart(e, nowMin, lead = 0) {
  const today = Math.floor(nowMin / 1440) * 1440;
  let best = null;
  for (const v of variantsOf(e).filter((v) => !lead || (v[0] === e[0] && v[2] === e[2]))) {
    const [, , dep, , , , days] = v;
    const [h, m] = dep.split(":").map(Number);
    for (let k = 0; k < 8; k++) {
      const day = today + k * 1440;
      const start = day + h * 60 + m;
      if ((days >> weekdayOf(day)) & 1 && start - lead > nowMin) {
        if (!best || start < best.start) best = { start, from: v[1], pd: stampAt(start - lead), liveFrom: stampAt(start - lead - BEFORE_MIN) };
        break;
      }
    }
  }
  return best;
}

/** Berlin wall-clock stamp (yyMMddHHmm) of an ISO time. */
const stampIso = (iso) => stampOf(Date.parse(iso));

/**
 * Today's departure abroad of a train from abroad, from Transitous (open data of each country's railway): planned and
 * live departure at its real origin. null when Transitous does not list it, the call budget is used up, or it fails.
 */
async function abroadNow(name, borderStart) {
  const a = ABROAD[name];
  if (!a) return null;
  const [stopId, gap] = a;
  const want = borderStart - gap; // planned departure abroad, minutes (Berlin wall clock, as minutesOf)
  const d = new Date((want - 20) * 60000); // stamps are Berlin wall clock read as UTC: convert to a real instant
  const wall = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
  const offset = (() => {
    const probe = new Date(`${wall}Z`);
    const s = stampOf(probe.getTime());
    return minutesOf(s) - probe.getTime() / 60000; // Berlin minus UTC, minutes
  })();
  const iso = new Date(Date.parse(`${wall}Z`) - offset * 60000).toISOString();
  const num = name.split(" ")[1];
  const list = await cached(`t:${stopId}:${iso.slice(0, 15)}`, 45000, async () => {
    const now = Date.now();
    tCalls = tCalls.filter((x) => now - x < 60000);
    if (tCalls.length >= TRANSITOUS_PER_MINUTE) throw new Error("busy");
    tCalls.push(now);
    const r = await fetch(`${TRANSITOUS}/v6/stoptimes?stopId=${encodeURIComponent(stopId)}&time=${iso}&window=3600&n=60&mode=HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL`, {
      headers: { "User-Agent": "zugmonitor/1.0 (+https://zugmonitor.de)", Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(`transitous ${r.status}`);
    return (await r.json()).stopTimes || [];
  }).catch(() => null);
  if (!list) return null;
  const re = new RegExp(`(^|\\D)${num}$`);
  const hits = list.filter((s) => (re.test(String(s.tripShortName || "")) || re.test(String(s.displayName || ""))) && s.place && s.place.scheduledDeparture);
  if (!hits.length) return null;
  hits.sort((x, y) => Number(y.realTime) - Number(x.realTime) || Math.abs(minutesOf(stampIso(x.place.scheduledDeparture)) - want) - Math.abs(minutesOf(stampIso(y.place.scheduledDeparture)) - want));
  const s = hits[0];
  const pd = stampIso(s.place.scheduledDeparture);
  if (Math.abs(minutesOf(pd) - want) > 45) return null; // a different run
  const canc = Boolean(s.cancelled || s.tripCancelled);
  const live = Boolean(s.realTime) && !canc;
  return {
    from: ORIGINS[name] ? ORIGINS[name][0] : null,
    pd,
    late: live && s.place.departure ? Math.max(0, diff(pd, stampIso(s.place.departure)) ?? 0) : null,
    live,
    canc,
  };
}

async function trainNow(name) {
  const e = TRAINS[name];
  const nowMin = minutesOf(stampOf(Date.now()));
  const lead = ABROAD[name] ? ABROAD[name][1] : 0;
  const runs = runsNow(e, nowMin, lead);
  if (!runs.length) {
    const nx = nextStart(e, nowMin, lead);
    return { run: null, next: nx && { pd: nx.pd, liveFrom: nx.liveFrom }, from: lead && ORIGINS[name] ? ORIGINS[name][0] : nx ? nx.from : e[1] };
  }
  // The usual origin and time of each candidate; the first one DB has a trip for wins (a train that runs from two
  // origins on different days has only one of them today).
  const [tt, num] = name.split(" ");
  let first = null;
  for (const run of runs.slice(0, 3)) {
    const o = run.origin;
    const depStamp = stampAt(run.start);
    const [oPlan, oChg] = await Promise.all([plan(o[0], depStamp), changes(o[0])]);
    const s = oPlan.find((x) => x.tl && x.tl.c === tt && x.tl.n === num && x.dp && x.dp.pt && Math.abs(minutesOf(x.dp.pt) - run.start) <= 60);
    if (s) return await runFound(name, e, run, s, oChg, lead);
    first = first || { run, depStamp };
  }
  const { run, depStamp } = first;
  const ab = lead ? await abroadNow(name, run.start) : null;
  const fail = ab ? { run: { found: true, state: "soon", pd: depStamp, late: null, canc: false, plat: null, platChanged: false, pa: null, lateArr: null, arrCanc: false, asOf: stampOf(Date.now()), abroad: ab, borderUnknown: true } } : { run: { found: false, pd: depStamp } };
  return { ...fail, from: run.origin[1], border: run.origin[1], to: run.origin[4] };
}

/**
 * The last station of today's trip, from DB's planned path at the origin (ppth). Of the stations the usual runs of
 * this number end at (with an arrival time), the last one the trip passes: ICE 624 ends in Düsseldorf, Köln or Essen
 * on different days, and DB's path says which today. null when none of them is on the path.
 */
function destOf(e, o, ppth) {
  const stops = (ppth || "").split("|").map(norm);
  const cands = variantsOf(e).filter((v) => v[0] === o[0] && v[2] === o[2]);
  let best = null;
  for (const v of cands) {
    const st = STATIONS[v[4]];
    const i = st ? stops.lastIndexOf(norm(st.name)) : -1;
    if (i >= 0 && (!best || i > best.i)) best = { i, v };
  }
  return best ? best.v : null;
}

async function runFound(name, e, run, s, oChg, lead) {
  const o = run.origin;
  const nowMin = minutesOf(stampOf(Date.now()));
  const abroadP = lead ? abroadNow(name, run.start) : Promise.resolve(null);
  const key = tripKey(s.id);
  const cf = oChg.find((x) => tripKey(x.id) === key);
  const pd = s.dp.pt;
  const cd = cf && cf.dp && cf.dp.ct ? cf.dp.ct : null;
  const canc = Boolean((cf && cf.dp && cf.dp.cs === "c") || s.dp.cs === "c");
  // Planned arrival at the last station: its timetable for the hour the usual arrival falls in (and the next one when it
  // is close to the hour), joined on the same trip.
  const dv = destOf(e, o, s.dp.ppth) || variantsOf(e).find((v) => v[0] === o[0] && v[2] === o[2]) || o;
  const arrMin = run.start + dv[7] + (minutesOf(pd) - run.start);
  const hours = new Set([stampAt(arrMin)]);
  if (arrMin % 60 >= 45) hours.add(stampAt(arrMin + 20));
  if (arrMin % 60 <= 15) hours.add(stampAt(arrMin - 20));
  const [dPlans, dChg] = await Promise.all([Promise.all([...hours].map((hh) => plan(dv[3], hh))), changes(dv[3])]);
  const d = dPlans.flat().find((x) => tripKey(x.id) === key && x.ar && x.ar.pt);
  const ct = dChg.find((x) => tripKey(x.id) === key);
  const pa = d ? d.ar.pt : null;
  const ca = ct && ct.ar && ct.ar.ct ? ct.ar.ct : null;
  const arrCanc = Boolean(ct && ct.ar && ct.ar.cs === "c");
  const late = canc ? null : Math.max(0, diff(pd, cd) ?? 0);
  const lateArr = canc || arrCanc || !pa || !ca ? null : Math.max(0, diff(pa, ca));
  const nowStamp = stampOf(Date.now());
  const leaves = minutesOf(cd || pd);
  const arrives = pa ? minutesOf(ca || pa) : null;
  const state = canc ? "cancelled" : nowMin < leaves ? "soon" : arrives !== null && nowMin > arrives ? "arrived" : "running";
  return {
    from: o[1],
    border: o[1],
    to: dv[4],
    run: {
      found: true,
      state,
      pd,
      late,
      canc,
      plat: (cf && cf.dp && cf.dp.cp) || s.dp.pp || null,
      platChanged: Boolean(cf && cf.dp && cf.dp.cp && s.dp.pp && cf.dp.cp !== s.dp.pp),
      pa,
      lateArr,
      arrCanc: arrCanc && !canc,
      asOf: nowStamp,
      abroad: await abroadP,
    },
  };
}

// ---- one trip: the stops a visitor gets on and off at, on either side of the border ---------------------------------
// GET /api/live/?train=ICE%20121&on=Amsterdam%20Centraal&off=D%C3%BCsseldorf%20Hbf
// Both stops must be stops of that train in the site's own data (data/stops.json, German) or its stops abroad
// (data/foreign-stops.json, Transitous). A German stop with a live lookup (data/live-stations.json) is read from DB's
// Timetables API; any other stop from the train's whole trip in Transitous, found at the train's German anchor stop
// (two calls, shared by every stop of the trip, cached 45 s). The run: the one whose departure at `on` is between 3 h
// ahead and 90 min after its planned arrival at `off`, today's, yesterday's or tomorrow's.
const { fold, stationKey, canonical, tripStops } = require("../lib/tripStops.cjs");
const STOPS = require("../data/stops.json");
const FOREIGN = (() => {
  try {
    // FOREIGN_STOPS_FILE: tests only (tests/unit/live-trip.mjs); the deployed function reads the committed file.
    if (process.env.FOREIGN_STOPS_FILE) return JSON.parse(require("fs").readFileSync(process.env.FOREIGN_STOPS_FILE, "utf8"));
    return require("../data/foreign-stops.json");
  } catch {
    return { stations: {}, trains: {} };
  }
})();
const STATION_BY_FOLD = new Map(Object.values(STATIONS).map((s) => [fold(s.name), s]));
for (const [k, v] of Object.entries(STATIONS)) STATION_BY_FOLD.set(fold(k), v);

function transitousGet(path) {
  const now = Date.now();
  tCalls = tCalls.filter((x) => now - x < 60000);
  if (tCalls.length >= TRANSITOUS_PER_MINUTE) return Promise.reject(new Error("busy"));
  tCalls.push(now);
  return fetch(`${TRANSITOUS}${path}`, {
    headers: { "User-Agent": "zugmonitor/1.0 (+https://zugmonitor.de)", Accept: "application/json" },
    signal: AbortSignal.timeout(4000),
  }).then((r) => {
    if (!r.ok) throw new Error(`transitous ${r.status}`);
    return r.json();
  });
}

/** Minutes (as minutesOf) -> ISO instant, for a Berlin wall-clock minute. */
function isoOfWall(min) {
  const d = new Date(min * 60000);
  const wall = `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00`;
  const probe = new Date(`${wall}Z`);
  const offset = minutesOf(stampOf(probe.getTime())) - probe.getTime() / 60000;
  return new Date(Date.parse(`${wall}Z`) - offset * 60000).toISOString();
}

/** Today's whole trip of `train` in Transitous: [{name, sa, sd, a, d, canc}] (ISO times), or null. */
async function transitousTrip(train, anchorMin) {
  const f = FOREIGN.trains[train];
  if (!f || !f.aid) return null;
  const num = train.split(" ")[1];
  const iso = isoOfWall(anchorMin - 20);
  return cached(`tt:${train}:${iso.slice(0, 13)}`, 45000, async () => {
    const board = await transitousGet(`/v6/stoptimes?stopId=${encodeURIComponent(f.aid)}&time=${iso}&window=3600&n=60&mode=HIGHSPEED_RAIL,LONG_DISTANCE,NIGHT_RAIL`);
    const re = new RegExp(`(^|\\D)${num}$`);
    const hits = (board.stopTimes || []).filter((s) => (re.test(String(s.tripShortName || "")) || re.test(String(s.displayName || ""))) && s.place && s.place.scheduledDeparture);
    hits.sort((x, y) => Math.abs(minutesOf(stampIso(x.place.scheduledDeparture)) - anchorMin) - Math.abs(minutesOf(stampIso(y.place.scheduledDeparture)) - anchorMin));
    const s = hits[0];
    if (!s || Math.abs(minutesOf(stampIso(s.place.scheduledDeparture)) - anchorMin) > 45) return null;
    const trip = await transitousGet(`/v6/trip?tripId=${encodeURIComponent(s.tripId)}`);
    const leg = (trip.legs || [])[0];
    if (!leg) return null;
    const live = Boolean(leg.realTime);
    return [leg.from, ...(leg.intermediateStops || []), leg.to].filter(Boolean).map((p) => ({
      name: canonical(p.name, STOPS.foreign),
      sa: p.scheduledArrival || null,
      sd: p.scheduledDeparture || null,
      a: p.arrival || null,
      d: p.departure || null,
      canc: Boolean(p.cancelled || leg.cancelled || s.tripCancelled),
      live,
    }));
  }).catch(() => null);
}

/** One end from DB: departure (`kind` "dp") or arrival ("ar") of the train at a station with a live lookup. */
async function dbEnd(st, train, kind, plannedMin) {
  const [tt, num] = train.split(" ");
  const hours = new Set([stampAt(plannedMin)]);
  if (plannedMin % 60 >= 40) hours.add(stampAt(plannedMin + 25));
  if (plannedMin % 60 <= 20) hours.add(stampAt(plannedMin - 25));
  const [plans, chg] = await Promise.all([Promise.all([...hours].map((h) => plan(st.eva, h))), changes(st.eva)]);
  const s = plans.flat().find((x) => x.tl && x.tl.c === tt && x.tl.n === num && x[kind] && x[kind].pt && Math.abs(minutesOf(x[kind].pt) - plannedMin) <= 60);
  if (!s) return null;
  const c = chg.find((x) => tripKey(x.id) === tripKey(s.id));
  const ev = c && c[kind];
  const pt = s[kind].pt;
  const canc = Boolean((ev && ev.cs === "c") || s[kind].cs === "c");
  const ct = ev && ev.ct ? ev.ct : null;
  return {
    pt,
    late: canc ? null : Math.max(0, diff(pt, ct) ?? 0),
    live: true,
    canc,
    plat: (ev && ev.cp) || s[kind].pp || null,
    platChanged: Boolean(ev && ev.cp && s[kind].pp && ev.cp !== s[kind].pp),
    src: "db",
  };
}

/** One end from the Transitous trip. */
function tripEnd(places, name, kind) {
  if (!places) return null;
  const p = places.find((x) => stationKey(x.name) === stationKey(name));
  if (!p) return null;
  const sched = kind === "dp" ? p.sd : p.sa;
  if (!sched) return null;
  const pt = stampIso(sched);
  const real = kind === "dp" ? p.d : p.a;
  const live = p.live && !p.canc;
  return { pt, late: live && real ? Math.max(0, diff(pt, stampIso(real)) ?? 0) : null, live, canc: p.canc, plat: null, platChanged: false, src: "transitous" };
}

async function tripNow(train, onName, offName) {
  const stops = tripStops(STOPS, FOREIGN, train);
  if (!stops) return { error: "unknown" };
  const a = stops.findIndex((s) => stationKey(s.name) === stationKey(onName) && s.dep !== null);
  const b = stops.findIndex((s, i) => i > a && stationKey(s.name) === stationKey(offName) && s.arr !== null);
  if (a < 0 || b < 0) return { error: "stops" };
  const A = stops[a];
  const B = stops[b];
  const nowMin = minutesOf(stampOf(Date.now()));
  const today = Math.floor(nowMin / 1440) * 1440;
  // Offsets are arrival-based (stops.py); a departure is the stop's dwell later.
  const dwell = (s) => (s.dep !== null && s.arr !== null && (s.dep - s.arr + 1440) % 1440 < 60 ? (s.dep - s.arr + 1440) % 1440 : 0);
  const depOff = (s) => s.off + dwell(s);
  const span = B.off - depOff(A);
  let onAbs = null;
  for (const day of [today, today - 1440, today + 1440]) {
    const t = day + A.dep;
    if (nowMin >= t - BEFORE_MIN && nowMin <= t + span + AFTER_MIN && (onAbs === null || Math.abs(t - nowMin) < Math.abs(onAbs - nowMin))) onAbs = t;
  }
  const plan0 = { on: A.name, off: B.name, pd: A.dep, pa: B.arr };
  if (onAbs === null) return { run: null, plan: plan0 };
  const offAbs = onAbs + span;
  const f = FOREIGN.trains[train];
  const anchor = f ? stops.find((s) => s.name === f.at) : null;
  const needTrip = [A, B].some((s) => !(s.cc === null && STATION_BY_FOLD.has(fold(s.name))));
  const placesP = needTrip && anchor ? transitousTrip(train, onAbs + depOff(anchor) - depOff(A)) : Promise.resolve(null);
  const end = async (s, kind, abs) => {
    const st = s.cc === null ? STATION_BY_FOLD.get(fold(s.name)) : null;
    if (st) {
      const e = await dbEnd(st, train, kind, abs).catch((e) => {
        if (e && e.message === "busy") throw e;
        return null;
      });
      if (e) return e;
    }
    return tripEnd(await placesP, s.name, kind);
  };
  const [on, off] = await Promise.all([end(A, "dp", onAbs), end(B, "ar", offAbs)]);
  const anyAbroad = A.cc !== null || B.cc !== null;
  return { run: { asOf: stampOf(Date.now()), on, off, pd: stampAt(onAbs), pa: stampAt(offAbs), abroad: anyAbroad }, plan: plan0 };
}

// ---- one change: the arriving train A and the next train B at one station, today ---------------------------------
// GET /api/live/?at=Berlin%20Hbf&a=ICE%201541&ta=348&b=ICE%20240&tb=374   (ta/tb: planned minutes after midnight, as in
// connection-pairs.json). Answers only for a change whose planned arrival is between CHG_BACK minutes ago and CHG_AHEAD
// minutes from now, so it is about the trip somebody is on or about to take.
const CHG_AHEAD = 240;
const CHG_BACK = 60;
const TRAIN_RE = /^(ICE|IC|EC|ECE|RJ|RJX|TGV|FLX|NJ|EN) \d{1,5}$/;

async function changeNow(st, an, ta, bn, tb) {
  const nowStamp = stampOf(Date.now());
  const nowMin = minutesOf(nowStamp);
  const today = Math.floor(nowMin / 1440) * 1440;
  let arr = null;
  for (const day of [today - 1440, today, today + 1440]) {
    const m = day + ta;
    if (m >= nowMin - CHG_BACK && m <= nowMin + CHG_AHEAD) arr = m;
  }
  if (arr === null) return { run: null };
  let dep = arr - ta + tb;
  if (tb < ta - 600) dep += 1440; // B leaves after midnight
  const hours = new Set([stampAt(arr), stampAt(dep)]);
  const [plans, chg] = await Promise.all([Promise.all([...hours].map((h) => plan(st.eva, h))), changes(st.eva)]);
  const all = plans.flat();
  const [at, anum] = an.split(" ");
  const [bt, bnum] = bn ? bn.split(" ") : [null, null];
  const sa = all.find((x) => x.tl && x.tl.c === at && x.tl.n === anum && x.ar && x.ar.pt);
  const sb = bn ? all.find((x) => x.tl && x.tl.c === bt && x.tl.n === bnum && x.dp && x.dp.pt) : null;
  const byKey = new Map(chg.map((x) => [tripKey(x.id), x]));
  const side = (s, k) => {
    if (!s) return null;
    const c = byKey.get(tripKey(s.id));
    const ev = c && c[k];
    const pt = s[k].pt;
    const ct = ev && ev.ct ? ev.ct : null;
    const canc = Boolean((ev && ev.cs === "c") || s[k].cs === "c");
    return {
      pt,
      ct,
      late: canc ? null : Math.max(0, diff(pt, ct) ?? 0),
      canc,
      plat: (ev && ev.cp) || s[k].pp || null,
      platChanged: Boolean(ev && ev.cp && s[k].pp && ev.cp !== s[k].pp),
    };
  };
  const A = side(sa, "ar");
  const B = side(sb, "dp");
  // Minutes between A's expected arrival and B's expected departure, now. null when either is unknown or cancelled.
  const spare = A && B && !A.canc && !B.canc ? Math.round(minutesOf(B.ct || B.pt) - minutesOf(A.ct || A.pt)) : null;
  return { run: { a: A, b: B, spare, asOf: nowStamp } };
}

module.exports = async function handler(req, res) {
  const on = process.env.LIVE_ENABLED === "1" && Boolean(process.env.DB_CLIENT_ID) && Boolean(process.env.DB_API_KEY);
  if (!on) return send(res, 200, { ok: false, error: "disabled" }, "public, s-maxage=60");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "method" });
  }
  const train = (() => {
    try {
      return new URL(req.url, "http://x").searchParams.get("train");
    } catch {
      return null;
    }
  })();
  const cq = (() => {
    try {
      const q = new URL(req.url, "http://x").searchParams;
      return q.has("at") ? q : null;
    } catch {
      return null;
    }
  })();
  if (cq) {
    const st = STATIONS[cq.get("at")];
    const an = cq.get("a") || "";
    const bn = cq.get("b") || "";
    const ta = Number(cq.get("ta"));
    const tb = Number(cq.get("tb"));
    const okMin = (x) => Number.isInteger(x) && x >= 0 && x < 1440;
    // b/tb are optional: without them only the arriving train is looked up (the banner above the departures).
    const noB = bn === "" && !cq.has("tb");
    if (!st || !TRAIN_RE.test(an) || !okMin(ta) || (!noB && (!TRAIN_RE.test(bn) || !okMin(tb)))) return send(res, 400, { error: "change" });
    try {
      return send(res, 200, { ok: true, ...(await changeNow(st, an, ta, noB ? null : bn, noB ? ta : tb)) }, "public, s-maxage=45");
    } catch (e) {
      return send(res, 200, { ok: false, error: e && e.message === "busy" ? "busy" : "upstream" }, "public, s-maxage=15");
    }
  }
  const trip = (() => {
    try {
      const q = new URL(req.url, "http://x").searchParams;
      return q.has("on") || q.has("off") ? { on: q.get("on") || "", off: q.get("off") || "" } : null;
    } catch {
      return null;
    }
  })();
  if (train !== null && trip) {
    if (!TRAIN_RE.test(train) || !trip.on || !trip.off || trip.on.length > 80 || trip.off.length > 80) return send(res, 400, { error: "trip" });
    try {
      const out = await tripNow(train, trip.on, trip.off);
      // A train or stop the site does not know: a quiet 200, like ?train= alone.
      if (out.error) return send(res, 200, { ok: false, error: out.error }, "public, s-maxage=86400");
      return send(res, 200, { ok: true, train, ...out }, "public, s-maxage=45");
    } catch (e) {
      return send(res, 200, { ok: false, error: e && e.message === "busy" ? "busy" : "upstream" }, "public, s-maxage=15");
    }
  }
  if (train !== null) {
    // Unknown or irregular trains: a quiet 200 so search results can ask for any train without console errors.
    if (!TRAINS[train]) return send(res, 200, { ok: false, error: "unknown" }, "public, s-maxage=86400");
    try {
      const out = await trainNow(train);
      return send(res, 200, { ok: true, train, border: out.from, to: TRAINS[train][4], ...out }, "public, s-maxage=45");
    } catch (e) {
      return send(res, 200, { ok: false, error: e && e.message === "busy" ? "busy" : "upstream" }, "public, s-maxage=15");
    }
  }
  let from, to;
  try {
    const q = new URL(req.url, "http://x").searchParams;
    from = STATIONS[q.get("from")];
    to = STATIONS[q.get("to")];
  } catch {
    from = to = null;
  }
  if (!from || !to || from.eva === to.eva) return send(res, 400, { error: "stations" });
  try {
    const out = await board(from, to);
    return send(res, 200, { ok: true, from: from.name, to: to.name, ...out }, "public, s-maxage=45");
  } catch (e) {
    return send(res, 200, { ok: false, error: e && e.message === "busy" ? "busy" : "upstream" }, "public, s-maxage=15");
  }
};
