/**
 * Train-to-train connection odds, browser side. Data: data/connection-pairs.json (scripts/connections.py), copied to
 * /search/connection-pairs.json. For one arriving train and one station it lists the trains that leave soon after, and for
 * each pair what really happened on the days both ran: how often the change worked, and the change time you really had.
 */
import { fold } from "./typeahead";

/**
 * [departing train, planned change time (min), days both ran, next train cancelled, departs (minutes after midnight), goes to,
 *  worked with 0 / 2 / 4 / 6 / 8 min to spare, [days it left, median min late leaving, % 6+ min late leaving],
 *  by how late the arriving train was (LATE_BINS in lib/liveChange.ts): flat [days, worked @2, worked @6] per bin]
 */
export type PairB = [string, number, number, number, number, string, number, number, number, number, number, [number, number, number], number[]?];

export interface PairStation {
  /** Position along the route (by planned time): orders the stations the way the train calls at them. */
  i: number;
  /** The arriving train at this station: [days, median min late, 90th percentile min late, % 6+ min late, % 15+ min late]. */
  a: [number, number, number, number, number];
  /** Planned arrival of the arriving train here, minutes after midnight (the timetable the listed departures belong to). */
  t: number;
  b: PairB[];
}

export interface PairTrain {
  o: string;
  d: string;
  s: Record<string, PairStation>;
}

export type PairFile = Record<string, PairTrain>;

/** The walking times the data has, in the order of the "worked with" columns of a pair. */
export const WALKS = [0, 2, 4, 6, 8];
export { WALK_FAST, WALK_SLOW } from "./connections";

export interface PairRow {
  train: string;
  gap: number;
  n: number;
  /** Days the change worked with `walk` minutes to spare. */
  ok: number;
  /** The same for each walking time in WALKS (0 / 2 / 4 / 6 / 8). */
  oks: number[];
  /** Days the next train ran but the change did not work. */
  late: number;
  cancelled: number;
  pct: number;
  cancelledPct: number;
  dep: number;
  to: string;
  /** How late the next train really left: days it left, median minutes late, share 6+ minutes late. */
  leftN: number;
  leftMed: number;
  left6: number;
  /** Days split by how late the arriving train was (see PairB). */
  bins?: number[];
}

/** Clock order after the arrival: a departure just after midnight sorts after one at 23:50. */
function dayOrder(dep: number, arrives: number): number {
  return dep < arrives - 600 ? dep + 1440 : dep;
}

export function rowsFor(st: PairStation, walk: number): PairRow[] {
  const col = 6 + Math.max(0, WALKS.indexOf(walk));
  return st.b
    .map((b) => {
      const ok = b[col] as number;
      const left = b[11];
      return {
        train: b[0],
        gap: b[1],
        n: b[2],
        ok,
        oks: [b[6], b[7], b[8], b[9], b[10]] as number[],
        late: Math.max(0, b[2] - b[3] - ok),
        cancelled: b[3],
        pct: (100 * ok) / b[2],
        cancelledPct: (100 * b[3]) / b[2],
        dep: b[4],
        to: b[5],
        leftN: left[0],
        leftMed: left[1],
        left6: left[2],
        bins: b[12],
      };
    })
    .sort((x, y) => dayOrder(x.dep, st.t) - dayOrder(y.dep, st.t) || (x.train < y.train ? -1 : 1));
}

/** The stations a train changes at, in the order the train calls at them. */
export function stationsOf(t: PairTrain): string[] {
  return Object.keys(t.s).sort((x, y) => t.s[x].i - t.s[y].i);
}

/** Where the next trains go, most common first, for the "Where are you going?" chips. */
export function destinationsOf(rows: PairRow[]): string[] {
  const count = new Map<string, number>();
  for (const r of rows) if (r.to) count.set(r.to, (count.get(r.to) ?? 0) + 1);
  return [...count.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([k]) => k);
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** True when the letters are a train type of the data, or the start of one ("IC" for ICE), or one that starts with them ("ECE" for EC). */
function looksLikeType(file: PairFile, letters: string): boolean {
  for (const key of Object.keys(file)) {
    const type = norm(key).replace(/\d+$/, "");
    if (type.startsWith(letters) || letters.startsWith(type)) return true;
  }
  return false;
}

/** Trains whose name or number starts with what was typed ("ice 1541", "1541", "ICE15"), best first. */
export function matchTrains(file: PairFile, input: string, limit = 6): string[] {
  const q = norm(input);
  if (q.length === 0) return [];
  const hits: { key: string; rank: number; days: number }[] = [];
  for (const [key, t] of Object.entries(file)) {
    const k = norm(key);
    const num = k.replace(/^[A-Z]+/, "");
    let rank = -1;
    if (k === q || num === q) rank = 0;
    else if (k.startsWith(q)) rank = 1;
    else if (/^\d+$/.test(q) && num.startsWith(q)) rank = 2;
    if (rank < 0) continue;
    const days = Math.max(0, ...Object.values(t.s).map((s) => s.a[0]));
    hits.push({ key, rank, days });
  }
  const letters = q.replace(/[^A-Z]/g, "");
  if (hits.length === 0 && letters && /\d/.test(q) && looksLikeType(file, letters)) {
    // "IC 543" for a train the data calls "ICE 543": fall back to the number alone, but only when the letters could be a train type.
    const digits = q.replace(/\D/g, "");
    for (const [key, t] of Object.entries(file)) {
      const num = norm(key).replace(/^[A-Z]+/, "");
      if (num !== digits && !(digits.length >= 3 && num.startsWith(digits))) continue;
      hits.push({ key, rank: num === digits ? 3 : 4, days: Math.max(0, ...Object.values(t.s).map((s) => s.a[0])) });
    }
  }
  return hits.sort((x, y) => x.rank - y.rank || y.days - x.days || (x.key < y.key ? -1 : 1)).slice(0, limit).map((h) => h.key);
}

/** The typed text as a known train name: "ice1541" -> "ICE 1541", or null. */
export function exactTrain(file: PairFile, input: string): string | null {
  const q = norm(input);
  if (!q) return null;
  return Object.keys(file).find((k) => norm(k) === q) ?? null;
}

/** Stations by name, folded, so "Hannover Hbf" from a link finds the data's spelling. */
export function stationKey(t: PairTrain, name: string): string | null {
  if (t.s[name]) return name;
  const want = fold(name);
  return Object.keys(t.s).find((s) => fold(s) === want) ?? null;
}

let loading: Promise<PairFile> | undefined;

/** Fetched the first time the page is used. */
export function loadPairs(): Promise<PairFile> {
  if (!loading) {
    loading = fetch("/search/connection-pairs.json").then((r) => {
      if (!r.ok) throw new Error(`pairs ${r.status}`);
      return r.json() as Promise<PairFile>;
    });
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}
