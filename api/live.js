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
    headers: { "DB-Client-Id": process.env.DB_CLIENT_ID, "DB-Api-Key": process.env.DB_API_KEY, Accept: "application/xml", "User-Agent": "german-punctuality.vercel.app" },
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

module.exports = async function handler(req, res) {
  const on = process.env.LIVE_ENABLED === "1" && Boolean(process.env.DB_CLIENT_ID) && Boolean(process.env.DB_API_KEY);
  if (!on) return send(res, 200, { ok: false, error: "disabled" }, "public, s-maxage=60");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, { error: "method" });
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
