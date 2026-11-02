// In-process checks of api/live.js ?train=&on=&off= (tripNow) against mock DB Timetables and Transitous servers, on a
// fixed clock (Mon 2 Nov 2026, 18:00 Berlin = 17:00 UTC) and a synthetic stops-abroad file for ICE 221 (Amsterdam ->
// Utrecht -> Arnhem -> Oberhausen ... Frankfurt). No keys, no network.
//   node tests/unit/live-trip.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const NOW = Date.parse('2026-11-02T17:00:00Z');
const STATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/live-stations.json'), 'utf8'));
const DUS = STATIONS['Düsseldorf Hbf'].eva;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gp-trip-'));
const foreignFile = path.join(tmp, 'foreign-stops.json');
// Anchor Oberhausen Hbf at 20:25 (1225); Amsterdam 146 min earlier (17:59), Utrecht 18:23/18:28, Arnhem 18:57/19:00.
fs.writeFileSync(foreignFile, JSON.stringify({
  stations: { 'Amsterdam Centraal': ['NL', 'T_ASD'], 'Utrecht Centraal': ['NL', 'T_UT'], 'Arnhem Centraal': ['NL', 'T_AH'] },
  trains: { 'ICE 221': { at: 'Oberhausen Hbf', t: 1225, aid: 'T_OBH', seen: '2026-11-02', s: [['Amsterdam Centraal', null, -146], ['Utrecht Centraal', -122, -117], ['Arnhem Centraal', -88, -85]] } },
}));

let transitousLive = true;
let calls = { t: 0, db: 0 };
const utc = (hhmm, day = '2026-11-02') => `${day}T${hhmm}:00Z`; // UTC = Berlin - 1 h in November
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/t/')) {
    calls.t++;
    res.setHeader('content-type', 'application/json');
    if (u.pathname === '/t/v6/stoptimes') {
      ok(u.searchParams.get('stopId') === 'T_OBH', 'Transitous asked at the anchor stop');
      return res.end(JSON.stringify({ stopTimes: [
        { tripId: 'trip-ice-123', tripShortName: 'ICE 123', displayName: 'ICE 123', place: { scheduledDeparture: utc('19:25') } },
        { tripId: 'trip-ice-221', tripShortName: 'ICE 221', displayName: 'ICE 221', place: { scheduledDeparture: utc('19:25') } },
      ] }));
    }
    if (u.pathname === '/t/v6/trip') {
      ok(u.searchParams.get('tripId') === 'trip-ice-221', 'the matching trip is read');
      return res.end(JSON.stringify({ legs: [{ realTime: transitousLive, from: { name: 'Amsterdam Centraal', scheduledDeparture: utc('16:59'), departure: utc('17:03') },
        intermediateStops: [
          { name: 'Utrecht Centraal', scheduledArrival: utc('17:23'), arrival: utc('17:27'), scheduledDeparture: utc('17:28'), departure: utc('17:31') },
          { name: 'Arnhem Centraal', scheduledArrival: utc('17:57'), arrival: utc('18:00'), scheduledDeparture: utc('18:00'), departure: utc('18:02'), cancelled: true },
          { name: 'Oberhausen Hbf', scheduledArrival: utc('19:24'), arrival: utc('19:30'), scheduledDeparture: utc('19:25'), departure: utc('19:31') },
        ],
        to: { name: 'Frankfurt (Main) Hauptbahnhof', scheduledArrival: utc('21:05'), arrival: utc('21:15') } }] }));
    }
  }
  if (u.pathname.startsWith('/db/')) {
    calls.db++;
    res.setHeader('content-type', 'application/xml');
    if (u.pathname === `/db/plan/${DUS}/261102/20`)
      return res.end(`<timetable station="Düsseldorf Hbf"><s id="777-2611021759-5"><tl c="ICE" n="221"/><ar pt="2611022045" pp="16"/><dp pt="2611022055" pp="16"/></s><s id="888-2611022000-1"><tl c="RE" n="1"/><dp pt="2611022010"/></s></timetable>`);
    if (u.pathname === `/db/fchg/${DUS}`) return res.end(`<timetable><s id="777-2611021759-5"><ar ct="2611022057" cp="17"/></s></timetable>`);
    return res.end('<timetable/>');
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
Object.assign(process.env, { LIVE_ENABLED: '1', DB_CLIENT_ID: 'x', DB_API_KEY: 'x', LIVE_UPSTREAM: `http://127.0.0.1:${port}/db`, TRANSITOUS_UPSTREAM: `http://127.0.0.1:${port}/t`, FOREIGN_STOPS_FILE: foreignFile });
const realNow = Date.now;
Date.now = () => NOW;
const handler = createRequire(import.meta.url)(path.join(ROOT, 'api/live.js'));

async function call(q) {
  return new Promise((resolve) => {
    const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve({ status: this.statusCode, cache: this.headers['Cache-Control'], body: JSON.parse(b) }); } };
    handler({ method: 'GET', url: `/api/live/?${new URLSearchParams(q).toString()}` }, res);
  });
}

// Abroad -> Germany: Amsterdam from the Transitous trip, Düsseldorf from DB.
let r = await call({ train: 'ICE 221', on: 'Amsterdam Centraal', off: 'Düsseldorf Hbf' });
const run = r.body.run;
ok(r.status === 200 && r.body.ok && run, 'answer ' + JSON.stringify(r.body));
ok(run && run.on && run.on.src === 'transitous' && run.on.pt === '2611021759' && run.on.late === 4 && run.on.live, 'Amsterdam: 17:59, 4 min late, Transitous ' + JSON.stringify(run && run.on));
ok(run && run.off && run.off.src === 'db' && run.off.pt === '2611022045' && run.off.late === 12 && run.off.plat === '17' && run.off.platChanged, 'Düsseldorf: DB 20:45, 12 late, platform 17 (was 16) ' + JSON.stringify(run && run.off));
ok(r.cache === 'public, s-maxage=45', 'cached 45 s at the CDN');

// Abroad -> abroad: both from the same trip (cached: no new Transitous calls).
const before = calls.t;
r = await call({ train: 'ICE 221', on: 'Utrecht Centraal', off: 'Arnhem Centraal' });
ok(r.body.ok && r.body.run.on.late === 3 && r.body.run.off.canc === true, 'Utrecht 3 late, Arnhem cancelled ' + JSON.stringify(r.body.run));
ok(calls.t === before, 'trip reused from the cache');

// Wrong direction or a stop the train does not have: quiet 200, no upstream call.
r = await call({ train: 'ICE 221', on: 'Düsseldorf Hbf', off: 'Amsterdam Centraal' });
ok(r.status === 200 && r.body.ok === false && r.body.error === 'stops', 'wrong direction refused ' + JSON.stringify(r.body));
r = await call({ train: 'ICE 221', on: 'Wien Hbf', off: 'Köln Hbf' });
ok(r.body.ok === false && r.body.error === 'stops', 'unknown stop refused');
r = await call({ train: 'ICE 99999', on: 'Amsterdam Centraal', off: 'Köln Hbf' });
ok(r.body.ok === false && (r.body.error === 'unknown' || r.status === 400), 'unknown train quiet');
r = await call({ train: 'DROP TABLE', on: 'a', off: 'b' });
ok(r.status === 400, 'bad train name 400');

// Outside the live window: run null with the plan (no upstream call).
Date.now = () => Date.parse('2026-11-02T04:00:00Z');
const c0 = calls.t + calls.db;
r = await call({ train: 'ICE 221', on: 'Amsterdam Centraal', off: 'Düsseldorf Hbf' });
ok(r.body.ok && r.body.run === null && r.body.plan && r.body.plan.on === 'Amsterdam Centraal', 'not now: run null ' + JSON.stringify(r.body));
ok(calls.t + calls.db === c0, 'not now: no upstream call');

// A feed without real time abroad: live false, no delay claimed.
Date.now = () => NOW + 30 * 60e3; // the 45 s cache has expired
transitousLive = false;
r = await call({ train: 'ICE 221', on: 'Amsterdam Centraal', off: 'Utrecht Centraal' });
ok(r.body.ok && r.body.run && r.body.run.on.live === false && r.body.run.on.late === null, 'no real time: no delay claimed ' + JSON.stringify(r.body.run));

Date.now = realNow;
server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`live trip: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
