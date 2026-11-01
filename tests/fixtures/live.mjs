// TEST ONLY. Mocked /api/live/ answers in the exact shape api/live.js sends (see trainNow(), board() and the handler).
// There are no DB keys in CI or in agent sandboxes, so live parts are rendered against these with Playwright's
// page.route(). Nothing here ships: tests/ is not part of the build.
//
// Stamps are DB local wall-clock time (Europe/Berlin), yyMMddHHmm, built relative to "now" so day words read "today".

const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Berlin stamp `min` minutes from now, rounded to the minute. */
export function stamp(min = 0) {
  const p = {};
  for (const x of FMT.formatToParts(new Date(Date.now() + min * 60000))) p[x.type] = x.value;
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}`;
}

import fs from 'node:fs';
const TRAINS = JSON.parse(fs.readFileSync(new URL('../../data/live-trains.json', import.meta.url)));
// The real function names the train's usual first and last German station (data/live-trains.json).
const base = (train, from, to) => (TRAINS[train] ? { ok: true, train, from: TRAINS[train][1], border: TRAINS[train][1], to: TRAINS[train][4] } : { ok: true, train, from, border: from, to });
/** Planned minutes from first to last station for a train (data/live-trains.json), so mocked times are plausible. */
const dur = (train, fallback = 270) => (TRAINS[train] ? TRAINS[train][7] : fallback);
const run = (o) => ({ found: true, state: 'soon', late: 0, canc: false, plat: '7', platChanged: false, lateArr: null, arrCanc: false, asOf: stamp(0), abroad: null, ...o });

/** Scenario name -> function returning the JSON body for ?train=. */
export const TRAIN = {
  // Leaves in 40 min, 12 late at departure, 9 late on arrival.
  late: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: run({ state: 'soon', pd: stamp(40), late: 12, pa: stamp(40 + dur(train)), lateArr: 9 }) }),
  // DB has a planned time but no change record: "no delay reported", never "on time".
  onTime: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: run({ state: 'soon', pd: stamp(25), late: 0, pa: stamp(25 + dur(train)), lateArr: 0 }) }),
  // Departure known, arrival planned time missing in DB's feed (a real gap): no arrival claim.
  noArr: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: run({ state: 'soon', pd: stamp(25), late: 3, pa: null, lateArr: null }) }),
  cancelled: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: run({ state: 'cancelled', pd: stamp(30), late: null, canc: true, pa: null, lateArr: null }) }),
  // Running, new platform at departure, stop at destination cancelled.
  platform: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: run({ state: 'running', pd: stamp(-20), late: 5, plat: '12', platChanged: true, pa: stamp(-20 + dur(train)), lateArr: null, arrCanc: true }) }),
  // Outside the live window: next planned start.
  next: (train = 'ICE 1541', from = 'München Hbf', to = 'Berlin Hbf') => ({ ...base(train, from, to), run: null, next: { pd: stamp(300), liveFrom: stamp(120) } }),
  // Train from abroad: departure at its real origin from Transitous, then the German line.
  abroad: (train = 'ICE 123', from = 'Amsterdam Centraal', to = 'Frankfurt (Main) Hbf') => ({ ...base(train, 'Emmerich', to), run: run({ state: 'running', pd: stamp(35), late: 14, pa: stamp(35 + dur(train, 190)), lateArr: 11, abroad: { from, pd: stamp(-60), late: 15, live: true, canc: false } }) }),
  // Not in live-trains.json (irregular train): quiet 200.
  unknown: () => ({ ok: false, error: 'unknown' }),
  // DB call budget used up / DB down.
  busy: () => ({ ok: false, error: 'busy' }),
  // Live switched off (preview deploys): nothing shows.
  disabled: () => ({ ok: false, error: 'disabled' }),
};

/** ?from=&to= route board. */
export function board(from = 'Köln Hbf', to = 'Berlin Hbf') {
  return {
    ok: true, from, to, asOf: stamp(0),
    trains: [
      { cat: 'ICE', n: '949', pd: stamp(12), late: 0, canc: false, plat: '4', platChanged: false, pa: stamp(12 + 260), lateArr: 0, arrCanc: false },
      { cat: 'ICE', n: '641', pd: stamp(48), late: 17, canc: false, plat: '5', platChanged: true, pa: stamp(48 + 262), lateArr: 14, arrCanc: false },
      { cat: 'IC', n: '2041', pd: stamp(75), late: null, canc: true, plat: '2', platChanged: false, pa: null, lateArr: null, arrCanc: false },
    ],
  };
}

/**
 * Install on a Playwright page or context: `scenario` is a TRAIN key applied to every ?train= call, or a map
 * { 'ICE 1541': 'late', ... } with '*' as the fallback. Route boards always get board().
 */
export async function mockLive(target, scenario = 'late') {
  await target.route('**/api/live/**', (r) => {
    const u = new URL(r.request().url());
    const train = u.searchParams.get('train');
    let body;
    if (train !== null) {
      const key = typeof scenario === 'string' ? scenario : (scenario[train] ?? scenario['*'] ?? 'unknown');
      body = TRAIN[key](train);
    } else if (u.searchParams.get('from')) body = board(u.searchParams.get('from'), u.searchParams.get('to'));
    else body = { ok: false, error: 'disabled' };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
