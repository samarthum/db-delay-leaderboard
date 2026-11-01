// TEST ONLY. Mocked /last7/ answers (public/last7/index.json + shards, as scripts/copy-search.mjs writes them from
// data/last7.json) for Playwright's context.route(). The real file comes from the daily job; the build environment has
// no access to the raw data, so every state of "The last 7 days" is rendered against these.
//
// Dates are the 7 days up to yesterday in Berlin, so the block never reads as stale unless a scenario asks for it.

const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
function berlinDay(offset) {
  return FMT.format(new Date(Date.now() + offset * 86400000));
}
export const days = (end = -1) => Array.from({ length: 7 }, (_, i) => berlinDay(end - 6 + i));

// Usual first and last German stops (data/stops.json).
const ENDS = {
  'ICE 224': ['München Hbf', 'Oberhausen Hbf'],
  'ICE 1541': ['Köln Hbf', 'Berlin Südkreuz'],
  'ICE 855': ['Köln Hbf', 'Berlin Ostbahnhof'],
};

/** Scenario -> per-day cells (scripts/last7.py's shape, station names inline). */
export const WEEK = {
  // Every day measured; arrival avg (8+0+22+9+0+31+4)/7 = 10.6 -> 11 min (early counts as 0), 15+ on 2 of 7.
  full: [[2, 8], [0, 0], [4, 22], [1, 9], [0, -3], [7, 31], [0, 4]],
  // No run on two days, one incomplete day, one arrival not measured: arrivals 8, 9, 31 -> 16 min, 15+ on 1 of 3.
  gaps: [[2, 8], null, '?', [1, 9], null, [7, 31], [0, null]],
  // Whole run cancelled once, last stop cancelled once, first stop cancelled once: 3 days with a cancellation.
  cancel: [[3, 17], [0, 6], 'x', [1, 2], [9, 'x'], ['x', 11], [2, 15]],
  // One day ended early at another stop (and that end is named).
  other: [[2, 8], [0, 0], [4, 22, null, 'Hannover Hbf'], [1, 9], [0, -3], [7, 31], [0, 4]],
  // Only one arrival measured.
  one: [null, null, null, [5, 12], null, null, null],
};

/**
 * Route /last7/ for `trains` (default: the trains the tests use) with `scenario` cells.
 * scenario 'empty': the site has no data yet (empty index); 'absent': data exists but not for these trains;
 * 'stale': the full week, but the latest day is 6 days ago; 'old': 9 days ago (block hidden).
 */
export async function mockLast7(ctx, scenario = 'full', trains = Object.keys(ENDS)) {
  const end = scenario === 'stale' ? -6 : scenario === 'old' ? -9 : -1;
  const d = days(end);
  const cells = WEEK[scenario] ?? WEEK.full;
  const shards = {};
  if (scenario !== 'absent' && scenario !== 'empty') {
    for (const t of trains) {
      const num = t.split(' ')[1];
      const key = (/^\d*/.exec(num)?.[0] ?? '').slice(0, 2) || '_';
      const [o, dd] = ENDS[t] ?? ['Köln Hbf', 'Berlin Hbf'];
      (shards[key] ??= {})[t] = { o, d: dd, c: cells };
    }
  }
  const index = scenario === 'empty'
    ? { asOf: null, days: [], gaps: {}, shards: [] }
    : { asOf: d[6], days: d, gaps: scenario === 'gaps' ? { [d[2]]: [10, 11, 12] } : {}, shards: Object.keys(shards).sort().concat(scenario === 'absent' ? ['22', '15', '85'] : []) };
  await ctx.route('**/last7/*.json', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop().replace('.json', '');
    if (name === 'index') return route.fulfill({ contentType: 'application/json', body: JSON.stringify(index) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(shards[name] ?? {}) });
  });
}
