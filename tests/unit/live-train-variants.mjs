// In-process checks of api/live.js ?train= for a train number that runs different routes on different days (ICE 624:
// München -> Düsseldorf, or -> Köln, plus a Frankfurt -> Düsseldorf variant), against a mock DB Timetables server and a
// fixed clock (Fri 6 Nov 2026, 12:30 Berlin = 11:30 UTC). No keys, no network.
//   node tests/unit/live-train-variants.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

const STATIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/live-stations.json'), 'utf8'));
const TRAINS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/live-trains.json'), 'utf8'));
const MUC = STATIONS['München Hbf'].eva, DUS = STATIONS['Düsseldorf Hbf'].eva, KOE = STATIONS['Köln Hbf'].eva;

// The data file must keep ICE 624 with its variants (it is the case the owner found).
const e624 = TRAINS['ICE 624'];
ok(Boolean(e624), 'ICE 624 has a live lookup');
const variants = e624 ? [e624.slice(0, 8), ...(e624[8] || [])] : [];
const toDus = variants.find((v) => v[0] === MUC && v[3] === DUS);
const toKoe = variants.find((v) => v[0] === MUC && v[3] === KOE);
ok(Boolean(toDus && toKoe), 'ICE 624 keeps both München variants (Düsseldorf and Köln)');
const hm = (t) => t.split(':').map(Number).reduce((h, m) => h * 60 + m);
const stampAt = (min) => `261106${String(Math.floor(min / 60) % 24).padStart(2, '0')}${String(min % 60).padStart(2, '0')}`;

let pathOfToday = 'Augsburg Hbf|Stuttgart Hbf|Mannheim Hbf|Köln Hbf|Düsseldorf Hbf'; // which stations the trip passes
let chgLate = 8;
let emptyPlan = false;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('content-type', 'application/xml');
  if (emptyPlan) return res.end('<timetable/>');
  const depMin = hm(toDus[2]);
  const arrDus = depMin + toDus[7];
  const arrKoe = depMin + toKoe[7];
  if (u.pathname === `/db/plan/${MUC}/261106/13`)
    return res.end(`<timetable><s id="624-2611061345-1"><tl c="ICE" n="624"/><dp pt="${stampAt(depMin)}" pp="21" ppth="${pathOfToday}"/></s></timetable>`);
  if (u.pathname === `/db/fchg/${MUC}`) return res.end(`<timetable><s id="624-2611061345-1"><dp ct="${stampAt(depMin + 3)}"/></s></timetable>`);
  if (u.pathname === `/db/plan/${DUS}/261106/${String(Math.floor(arrDus / 60)).padStart(2, '0')}`)
    return res.end(`<timetable><s id="624-2611061345-9"><tl c="ICE" n="624"/><ar pt="${stampAt(arrDus)}"/></s></timetable>`);
  if (u.pathname === `/db/plan/${KOE}/261106/${String(Math.floor(arrKoe / 60)).padStart(2, '0')}`)
    return res.end(`<timetable><s id="624-2611061345-7"><tl c="ICE" n="624"/><ar pt="${stampAt(arrKoe)}"/></s></timetable>`);
  if (u.pathname === `/db/fchg/${DUS}`) return res.end(`<timetable><s id="624-2611061345-9"><ar ct="${stampAt(arrDus + chgLate)}"/></s></timetable>`);
  if (u.pathname === `/db/fchg/${KOE}`) return res.end(`<timetable><s id="624-2611061345-7"><ar ct="${stampAt(arrKoe + 2)}"/></s></timetable>`);
  res.end('<timetable/>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
Object.assign(process.env, { LIVE_ENABLED: '1', DB_CLIENT_ID: 'x', DB_API_KEY: 'x', LIVE_UPSTREAM: `http://127.0.0.1:${server.address().port}/db` });
let NOW = Date.parse('2026-11-06T11:30:00Z');
Date.now = () => NOW;
const handler = createRequire(import.meta.url)(path.join(ROOT, 'api/live.js'));
const call = (q) => new Promise((resolve) => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { resolve(JSON.parse(b)); } };
  handler({ method: 'GET', url: `/api/live/?${q}` }, res);
});

// 1. The trip passes Düsseldorf: the answer ends there, with its own delay.
let r = await call('train=ICE%20624');
ok(r.ok && r.run && r.run.found, 'found today (Düsseldorf day)');
ok(r.to === 'Düsseldorf Hbf', `ends in Düsseldorf (got ${r.to})`);
ok(r.from === 'München Hbf', `starts in München (got ${r.from})`);
ok(r.run.late === 3 && r.run.lateArr === chgLate, `delays 3 and ${chgLate} (got ${r.run.late}, ${r.run.lateArr})`);
ok(r.run.state === 'soon', `state soon (got ${r.run.state})`);

// 2. A day the trip stops at Köln: the same number ends there instead.
pathOfToday = 'Augsburg Hbf|Stuttgart Hbf|Mannheim Hbf|Köln Hbf';
NOW += 25 * 60000; // past the 20 min plan cache
r = await call('train=ICE%20624&x=2');
ok(r.ok && r.run && r.run.found && r.to === 'Köln Hbf', `ends in Köln (got ${r.to})`);
ok(r.run.lateArr === 2, `Köln arrival delay 2 (got ${r.run.lateArr})`);

// 3. Before the window opens (3 h before 13:45): next run, from the stations of the nearest variant.
NOW = Date.parse('2026-11-06T08:00:00Z'); // 09:00 Berlin
r = await call('train=ICE%20624&x=3');
ok(r.ok && r.run === null && r.next && r.next.pd === '2611061345' && r.next.liveFrom === '2611061045', `next 13:45, live from 10:45 (got ${JSON.stringify(r.next)})`);
ok(r.from === 'München Hbf', `next run named from München (got ${r.from})`);

// 4. An irregular number with no lookup stays a quiet 200.
r = await call('train=ICE%2099999');
ok(r.ok === false && r.error === 'unknown', 'unknown number is a quiet unknown');

// 5. A train whose trip is in none of its candidate origins' timetables reports found:false, not a crash.
NOW = Date.parse('2026-11-06T12:30:00Z'); // 13:30 Berlin, München run about to leave
emptyPlan = true;
r = await call('train=ICE%20624&x=5');
ok(r.ok && (r.run === null || r.run.found === false), `no trip in DB: found false or none (got ${JSON.stringify(r.run)})`);
ok(r.ok && r.run && r.run.found === false && r.run.pd === '2611061345', 'found:false carries the planned departure');

server.close();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
