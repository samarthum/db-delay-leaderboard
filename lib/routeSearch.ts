/**
 * Route search without I/O: turn "8:14 Köln to Berlin", "von München nach Hamburg", "cologne -> munich" or
 * "köln berlin" into two sets of stations and a time, then list the long-distance trains that run from the first
 * set to the second, each with how often it arrives 15+ min late at the stop where you get off.
 *
 * Data: data/stops.json (written by scripts/stops.py), fetched by the browser the first time a route is asked for.
 */
import { fold, words } from "./typeahead";

/** [station index, dep minutes, arr minutes, runs, measured, late %, avg min, cancelled %, minutes after the run's first stop] */
export type RawStop = [number, number | null, number | null, number, number, number | null, number | null, number, number];
export type RawTrain = [string, string, RawStop[]];
export interface StopsRaw {
  window: { firstMonth: string; lastMonth: string; monthCount: number };
  params: { minStopRuns: number; lateMinutes: number };
  stations: string[];
  trains: RawTrain[];
}

export interface StopsIndex {
  raw: StopsRaw;
  stationWords: string[][];
  /** Number of trains that serve each station: big stations first when a name is ambiguous. */
  weight: number[];
}

export function buildStops(raw: StopsRaw): StopsIndex {
  const weight = new Array<number>(raw.stations.length).fill(0);
  for (const t of raw.trains) for (const s of t[2]) weight[s[0]] += 1;
  return { raw, stationWords: raw.stations.map((n) => words(fold(n))), weight };
}

// ---------------------------------------------------------------- parsing

export interface ParsedRoute {
  from: string;
  to: string;
  /** Minutes after midnight, or null. */
  time: number | null;
}

const TIME_RE = /(?<![\d:.])([01]?\d|2[0-3])\s*(?::|\.|h|uhr)\s*([0-5]\d)(?!\d)|(?<![\d:.])([01]?\d|2[0-3])\s*(?:uhr|h)(?![a-z])/i;

/** Pulls "8:14", "08.14", "8h", "8 Uhr", "20:05" out of the text. Returns the minutes and the text without it. */
export function extractTime(input: string): { time: number | null; rest: string } {
  const m = TIME_RE.exec(input);
  if (!m) return { time: null, rest: input };
  const h = Number(m[1] ?? m[3]);
  const min = m[2] ? Number(m[2]) : 0;
  return { time: h * 60 + min, rest: (input.slice(0, m.index) + " " + input.slice(m.index + m[0].length)).replace(/\s+/g, " ").trim() };
}

const SEPARATOR = /\s*(?:→|->|=>|—|–|>)\s*|\s+(?:to|nach|bis|until)\s+|\s+-\s+/i;
const LEADING = /^(?:(?:from|von|ab|around|um|at|gegen)\s+)+/i;

/**
 * Splits text into two place names. Uses an explicit separator when there is one; otherwise returns null and the
 * caller tries word splits against the station list.
 */
export function splitRoute(input: string): { time: number | null; from: string; to: string } | null {
  const { time, rest } = extractTime(input);
  const cleaned = rest.replace(LEADING, "").replace(/\b(?:um|at|gegen|around)\s*$/i, "").trim();
  const parts = cleaned.split(SEPARATOR).map((p) => p.replace(LEADING, "").trim()).filter(Boolean);
  if (parts.length === 2) return { time, from: parts[0], to: parts[1] };
  return null;
}

// ---------------------------------------------------------------- station sets

function wordsMatch(q: string[], name: string[]): boolean {
  const used = new Set<number>();
  return q.every((qw) => {
    const i = name.findIndex((nw, idx) => !used.has(idx) && nw.startsWith(qw));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

/** Every station whose name starts with every word typed: "köln" is all Köln stations, "köln hbf" is one. */
export function stationsFor(idx: StopsIndex, text: string): number[] {
  const q = words(fold(text));
  if (q.length === 0) return [];
  const hits: number[] = [];
  idx.stationWords.forEach((w, i) => {
    if (wordsMatch(q, w)) hits.push(i);
  });
  // "Frankfurt" is also Frankfurt Flughafen and Frankfurt Süd; keep only stations that matter when many match.
  if (hits.length > 6) {
    const top = Math.max(...hits.map((i) => idx.weight[i]));
    return hits.filter((i) => idx.weight[i] >= top * 0.25).sort((a, b) => idx.weight[b] - idx.weight[a]);
  }
  return hits.sort((a, b) => idx.weight[b] - idx.weight[a]);
}

export interface RouteQuery {
  from: number[];
  to: number[];
  time: number | null;
  /** What was typed for each end, for the heading: "Köln", "Berlin". */
  fromText: string;
  toText: string;
}

/** Why a text with a separator is not a usable route. */
export type RouteProblem = { missing: string } | { same: true };

/** The two ends must be different places: "Hannover to Hannover" is not a trip. */
function distinct(from: number[], to: number[]): boolean {
  return from.some((f) => !to.includes(f)) && to.some((t) => !from.includes(t)) && !(from.length === to.length && from.every((f) => to.includes(f)));
}

/**
 * Like parseRoute, but says what is wrong when the text has an explicit separator ("Köln to Zürich") and cannot be
 * used, so the page can answer instead of falling back to a train-number message.
 */
export function diagnoseRoute(idx: StopsIndex, input: string): { query: RouteQuery } | RouteProblem | null {
  const direct = splitRoute(input);
  if (!direct) {
    const q = parseRoute(idx, input);
    return q ? { query: q } : null;
  }
  const from = stationsFor(idx, direct.from);
  const to = stationsFor(idx, direct.to);
  if (!from.length) return { missing: direct.from };
  if (!to.length) return { missing: direct.to };
  if (!distinct(from, to)) return { same: true };
  return { query: { from, to, time: direct.time, fromText: direct.from, toText: direct.to } };
}

/** Parse the text into two station sets, or null when it is not a route. */
export function parseRoute(idx: StopsIndex, input: string): RouteQuery | null {
  const direct = splitRoute(input);
  if (direct) {
    const r = diagnoseRoute(idx, input);
    return r && "query" in r ? r.query : null;
  }
  // No separator: "köln berlin", "köln hbf berlin hbf". Try every split of the words, most specific first.
  const { time, rest } = extractTime(input);
  const tokens = rest.replace(LEADING, "").split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  // A single station name with several words ("Köln Hbf") is not a route.
  if (stationsFor(idx, tokens.join(" ")).length > 0) return null;
  let best: { q: RouteQuery; score: number } | null = null;
  for (let k = 1; k < tokens.length; k++) {
    const fromText = tokens.slice(0, k).join(" ");
    const toText = tokens.slice(k).join(" ");
    const from = stationsFor(idx, fromText);
    const to = stationsFor(idx, toText);
    if (!from.length || !to.length || !distinct(from, to)) continue;
    const score = Math.max(...from.map((i) => idx.weight[i])) + Math.max(...to.map((i) => idx.weight[i]));
    if (!best || score > best.score) best = { q: { from, to, time, fromText, toText }, score };
  }
  return best?.q ?? null;
}

// ---------------------------------------------------------------- destinations

const TO_TAIL = /^(.*?)(?:\s+(?:to|nach|bis)(?:\s+(.*))?|\s*(?:→|->|=>|>)\s*(.*))$/i;

export interface Destinations {
  from: number[];
  fromText: string;
  time: number | null;
  /** What was typed after the separator (may be empty). */
  prefix: string;
  /** Places reachable from the start by one long-distance train, most trains first. */
  options: { name: string; trains: number }[];
}

/**
 * For "Köln to" or "Köln to B": the places you can get to from Köln on a train that stops there, filtered by what
 * was typed after "to". Null when the text has no separator or the start is not a known station.
 */
export function destinations(idx: StopsIndex, input: string, limit = 5): Destinations | null {
  const m = TO_TAIL.exec(input.trim());
  if (!m) return null;
  const { time, rest } = extractTime(m[1]);
  const fromText = rest.replace(LEADING, "").trim();
  const from = stationsFor(idx, fromText);
  if (!from.length) return null;
  const prefix = (m[2] ?? m[3] ?? "").trim();
  const q = words(fold(prefix));
  const fromSet = new Set(from);
  const count = new Map<number, number>();
  for (const [, , stops] of idx.raw.trains) {
    const i = stops.findIndex((s) => fromSet.has(s[0]) && s[1] !== null);
    if (i < 0) continue;
    const seen = new Set<number>();
    for (let j = i + 1; j < stops.length; j++) {
      const st = stops[j];
      if (fromSet.has(st[0]) || st[2] === null || st[8] <= stops[i][8] || seen.has(st[0])) continue;
      if (q.length && !wordsMatch(q, idx.stationWords[st[0]])) continue;
      seen.add(st[0]);
    }
    for (const s of seen) count.set(s, (count.get(s) ?? 0) + 1);
  }
  const options = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([s, trains]) => ({ name: idx.raw.stations[s], trains }));
  return { from, fromText, time, prefix, options };
}

// ---------------------------------------------------------------- matching

export interface RouteHit {
  type: string;
  num: string;
  /** Typical planned departure at the stop you board, minutes after midnight. */
  dep: number;
  /** Typical planned arrival at the stop you get off. */
  arr: number | null;
  fromName: string;
  toName: string;
  /** Scheduled runs and measured arrivals at the stop you get off. */
  runs: number;
  measured: number;
  /** Share arriving 15+ min late at that stop, null when too few runs. */
  late: number | null;
  avg: number | null;
  cancelled: number;
  /** Stops travelled. */
  hops: number;
}

/** Minutes between two clock times, the short way round the clock. */
export function clockGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
}

/** Trains that run from any `from` station to any `to` station in that order. Closest to `time` first, else earliest. */
export function findTrains(idx: StopsIndex, q: RouteQuery): RouteHit[] {
  const fromSet = new Set(q.from);
  const toSet = new Set(q.to);
  const hits: RouteHit[] = [];
  for (const [type, num, stops] of idx.raw.trains) {
    let best: { i: number; j: number; score: number } | null = null;
    for (let i = 0; i < stops.length; i++) {
      if (!fromSet.has(stops[i][0]) || stops[i][1] === null) continue;
      for (let j = i + 1; j < stops.length; j++) {
        if (!toSet.has(stops[j][0]) || stops[j][2] === null || stops[j][8] <= stops[i][8]) continue;
        const score = idx.weight[stops[i][0]] + idx.weight[stops[j][0]];
        if (!best || score > best.score) best = { i, j, score };
      }
    }
    if (!best) continue;
    const a = stops[best.i];
    const b = stops[best.j];
    hits.push({
      type,
      num,
      dep: a[1] as number,
      // From the boarding time plus the timetable's travel time, so both ends come from the same day's timetable.
      arr: (a[1] as number) + (b[8] - a[8]),
      fromName: idx.raw.stations[a[0]],
      toName: idx.raw.stations[b[0]],
      runs: b[3],
      measured: b[4],
      late: b[5],
      avg: b[6],
      cancelled: b[7],
      hops: best.j - best.i,
    });
  }
  const t = q.time;
  // Without a time the day starts at 04:00, so night trains come last instead of first.
  const dayOrder = (m: number) => (m - 240 + 1440) % 1440;
  hits.sort((x, y) =>
    t === null ? dayOrder(x.dep) - dayOrder(y.dep) || x.num.localeCompare(y.num) : clockGap(x.dep, t) - clockGap(y.dep, t) || x.dep - y.dep,
  );
  return hits;
}

/** "08:14" */
export function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
