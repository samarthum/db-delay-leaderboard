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

// ---- one train: today's run of a train page's train, from its first to its last station ------------------------------
// data/live-trains.json: "ICE 1541" -> [originEva, originName, "HH:MM", destEva, destName, "HH:MM", weekdayBits, minutes]
// (scripts/live_trains.py: the usual run in the last two months). The run is looked up in the origin's timetable for the
// hour it leaves, then the changes at both ends give the delay DB reports now.
const TRAINS = require("../data/live-trains.json");
const BEFORE_MIN = 180; // show a run this long before it leaves
const AFTER_MIN = 90; // and until this long after its planned arrival

const p2 = (n) => String(n).padStart(2, "0");
/** Minutes since 2000 (as minutesOf) back to a yyMMddHHmm stamp. */
function stampAt(min) {
  const d = new Date(min * 60000);
  return `${String(d.getUTCFullYear()).slice(2)}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
}

/** Which run of this train (today's or yesterday's start) is on now, if any. */
function runNow(entry, nowMin) {
  const [, , dep, , , , days, mins] = entry;
  const [h, m] = dep.split(":").map(Number);
  const today = Math.floor(nowMin / 1440) * 1440;
  for (const day of [today, today - 1440]) {
    const start = day + h * 60 + m;
    const wd = (new Date(day * 60000).getUTCDay() + 6) % 7; // Monday = 0
    if (!((days >> wd) & 1)) continue;
    if (nowMin >= start - BEFORE_MIN && nowMin <= start + mins + AFTER_MIN) return { start, end: start + mins };
  }
  return null;
}

async function trainNow(name) {
  const e = TRAINS[name];
  const nowMin = minutesOf(stampOf(Date.now()));
  const run = runNow(e, nowMin);
  if (!run) return { run: null };
  const [tt, num] = name.split(" ");
  const depStamp = stampAt(run.start);
  const [oPlan, oChg] = await Promise.all([plan(e[0], depStamp), changes(e[0])]);
  const s = oPlan.find((x) => x.tl && x.tl.c === tt && x.tl.n === num && x.dp && x.dp.pt);
  if (!s) return { run: { found: false, pd: depStamp } };
  const key = tripKey(s.id);
  const cf = oChg.find((x) => tripKey(x.id) === key);
  const pd = s.dp.pt;
  const cd = cf && cf.dp && cf.dp.ct ? cf.dp.ct : null;
  const canc = Boolean((cf && cf.dp && cf.dp.cs === "c") || s.dp.cs === "c");
  // Planned arrival at the last station: its timetable for the hour the usual arrival falls in (and the next one when it
  // is close to the hour), joined on the same trip.
  const arrMin = run.end + (minutesOf(pd) - run.start);
  const hours = new Set([stampAt(arrMin)]);
  if (arrMin % 60 >= 45) hours.add(stampAt(arrMin + 20));
  if (arrMin % 60 <= 15) hours.add(stampAt(arrMin - 20));
  const [dPlans, dChg] = await Promise.all([Promise.all([...hours].map((hh) => plan(e[3], hh))), changes(e[3])]);
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
    },
  };
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
  if (train !== null) {
    if (!TRAINS[train]) return send(res, 400, { error: "train" });
    try {
      const out = await trainNow(train);
      return send(res, 200, { ok: true, train, from: TRAINS[train][1], to: TRAINS[train][4], ...out }, "public, s-maxage=45");
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
