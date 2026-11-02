/**
 * Route search without I/O: turn "8:14 Köln to Berlin", "von München nach Hamburg", "cologne -> munich" or
 * "köln berlin" into two sets of stations and a time, then list the long-distance trains that run from the first
 * set to the second, each with how often it arrives 15+ min late at the stop where you get off.
 *
 * Data: data/stops.json (written by scripts/stops.py), fetched by the browser the first time a route is asked for.
 */
import { fold, words } from "./typeahead";

/**
 * [station index, dep minutes, arr minutes, runs, measured, late %, avg min, cancelled %, minutes after the run's first
 * stop, departure figures where the train starts there (stops abroad only): [measured, late %, avg]]
 */
export type RawStop = [number, number | null, number | null, number, number, number | null, number | null, number, number, ([number, number | null, number | null] | undefined)?];
/** [type, number, stops, index into `foreign` when the train ends abroad, index into `foreign` when it starts abroad] */
export type RawTrain = [string, string, RawStop[], (number | null)?, (number | null)?];
export interface StopsRaw {
  window: { firstMonth: string; lastMonth: string; monthCount: number };
  params: { minStopRuns: number; lateMinutes: number };
  stations: string[];
  /** Places abroad where long-distance trains end ("Amsterdam Centraal"): the source records no stops outside Germany. */
  foreign: string[];
  trains: RawTrain[];
  /** Stations abroad (scripts/copy-search.mjs from data/foreign-stops.json): station index -> country ("NL"). */
  abroad?: Record<string, string>;
  /** Countries whose open data gives each train's delay at its stops there (data/abroad-history.json). */
  sources?: string[];
  abroadWindow?: { firstMonth: string; lastMonth: string } | null;
}

export interface StopsIndex {
  raw: StopsRaw;
  stationWords: string[][];
  /** Number of trains that serve each station: big stations first when a name is ambiguous. */
  weight: number[];
  foreignWords: string[][];
  /** Trains heading to each foreign place. */
  foreignWeight: number[];
  /** For each `foreign` label, the station of the same name in `stations` (stops abroad), or -1. */
  labelStation: number[];
}

const plain = (s: string) => fold(s).replace(/ /g, "");

/** Country of a station abroad ("NL"), null for a German one. */
export function countryOf(idx: StopsIndex, station: number): string | null {
  return idx.raw.abroad?.[String(station)] ?? null;
}

/** Whether the train's figures at this station exist: German stations always, stations abroad when the country has a source. */
export function hasHistory(idx: StopsIndex, station: number): boolean {
  const cc = countryOf(idx, station);
  return cc === null || (idx.raw.sources ?? []).includes(cc);
}

export function buildStops(raw: StopsRaw): StopsIndex {
  const weight = new Array<number>(raw.stations.length).fill(0);
  const foreign = raw.foreign ?? [];
  const foreignWeight = new Array<number>(foreign.length).fill(0);
  for (const t of raw.trains) {
    for (const s of t[2]) weight[s[0]] += 1;
    if (t[3] !== undefined && t[3] !== null) foreignWeight[t[3]] += 1;
    if (t[4] !== undefined && t[4] !== null) foreignWeight[t[4]] += 1;
  }
  const byName = new Map(raw.stations.map((n, i) => [plain(n), i]));
  const labelStation = foreign.map((n) => byName.get(plain(n)) ?? -1);
  return { raw: { ...raw, foreign }, stationWords: raw.stations.map((n) => words(fold(n))), weight, foreignWords: foreign.map((n) => words(fold(n))), foreignWeight, labelStation };
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

/** Foreign places a text names ("amsterdam" is Amsterdam Centraal), most trains first. */
export function foreignFor(idx: StopsIndex, text: string): number[] {
  const q = words(fold(text));
  if (q.length === 0) return [];
  const hits: number[] = [];
  idx.foreignWords.forEach((w, i) => {
    if (wordsMatch(q, w)) hits.push(i);
  });
  return hits.sort((a, b) => idx.foreignWeight[b] - idx.foreignWeight[a]);
}

export interface RouteQuery {
  from: number[];
  /** Foreign places the trains come from ("Amsterdam"). Only used when no German station matches the start. */
  fromForeign?: number[];
  /** German stations. Empty when the trip ends abroad: then `toForeign` is set. */
  to: number[];
  /** Foreign places the trains head to. Only used when no German station matches. */
  toForeign: number[];
  time: number | null;
  /** What was typed for each end, for the heading: "Köln", "Berlin". */
  fromText: string;
  toText: string;
}

/** Why a text with a separator is not a usable route. */
export type RouteProblem = { missing: string } | { same: true } | { fromAbroad: string };

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
  const toForeign = to.length ? [] : foreignFor(idx, direct.to);
  if (!from.length) {
    const abroad = foreignFor(idx, direct.from);
    if (!abroad.length) return { missing: direct.from };
    // Trains that start there and run into Germany: board at their first German stop.
    if (to.length && idx.raw.trains.some((t) => t[4] !== undefined && t[4] !== null && abroad.includes(t[4])))
      return { query: { from: [], fromForeign: abroad, to, toForeign: [], time: direct.time, fromText: direct.from, toText: direct.to } };
    // The matched place ("Amsterdam Centraal"), not the raw text: a typed country would not fit the sentence.
    return { fromAbroad: idx.raw.foreign[abroad[0]] };
  }
  if (!to.length && !toForeign.length) return { missing: direct.to };
  if (to.length && !distinct(from, to)) return { same: true };
  return { query: { from, to, toForeign, time: direct.time, fromText: direct.from, toText: direct.to } };
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
    const toForeign = to.length ? [] : foreignFor(idx, toText);
    if (!from.length && to.length) {
      // "amsterdam köln": a train from abroad
      const fromForeign = foreignFor(idx, fromText).filter((f) => idx.raw.trains.some((t) => t[4] === f));
      if (fromForeign.length) {
        const score = Math.max(...fromForeign.map((i) => idx.foreignWeight[i])) + Math.max(...to.map((i) => idx.weight[i]));
        if (!best || score > best.score) best = { q: { from: [], fromForeign, to, toForeign: [], time, fromText, toText }, score };
      }
      continue;
    }
    if (!from.length || (!to.length && !toForeign.length) || (to.length && !distinct(from, to))) continue;
    const score =
      Math.max(...from.map((i) => idx.weight[i])) +
      (to.length ? Math.max(...to.map((i) => idx.weight[i])) : Math.max(...toForeign.map((i) => idx.foreignWeight[i])));
    if (!best || score > best.score) best = { q: { from, to, toForeign, time, fromText, toText }, score };
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
  const abroad = new Map<number, number>();
  for (const [, , stops, fi] of idx.raw.trains) {
    const i = stops.findIndex((s) => fromSet.has(s[0]) && s[1] !== null);
    if (i < 0) continue;
    const seen = new Set<number>();
    for (let j = i + 1; j < stops.length; j++) {
      const st = stops[j];
      if (fromSet.has(st[0]) || st[2] === null || st[8] <= stops[i][8] || seen.has(st[0])) continue;
      if (q.length && !wordsMatch(q, idx.stationWords[st[0]])) continue;
      seen.add(st[0]);
    }
    const last = stops[stops.length - 1];
    if (fi !== undefined && fi !== null && stops.length - 1 > i && last[2] !== null && last[8] > stops[i][8] && (!q.length || wordsMatch(q, idx.foreignWords[fi]))) {
      // The final destination abroad: one entry with the station of the same name when stops abroad exist for it.
      const st = idx.labelStation[fi];
      if (st >= 0) {
        if (!fromSet.has(st)) seen.add(st);
      } else abroad.set(fi, (abroad.get(fi) ?? 0) + 1);
    }
    for (const s of seen) count.set(s, (count.get(s) ?? 0) + 1);
  }
  const byTrains = (x: [number, number], y: [number, number]) => y[1] - x[1];
  const de = [...count.entries()].sort(byTrains).map(([st, trains]) => ({ name: idx.raw.stations[st], trains }));
  const ab = [...abroad.entries()].sort(byTrains).map(([f, trains]) => ({ name: idx.raw.foreign[f], trains }));
  // Nothing typed yet: keep two slots for places abroad, or "Düsseldorf to" would never show that Amsterdam works.
  const options = q.length ? [...de, ...ab].sort((x, y) => y.trains - x.trains).slice(0, limit) : [...de.slice(0, limit - 2), ...ab.slice(0, 2)];
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
  /** The trip ends abroad: `late` is measured at the train's last stop in Germany. */
  abroad: boolean;
  /** The trip starts abroad: `dep` is the time at the first German stop (fromName). */
  fromAbroad?: boolean;
  /** Country of the stop you board / get off when it is abroad ("NL"), else null. */
  fromCc?: string | null;
  toCc?: string | null;
  /** The stop you get off is abroad in a country with no open delay data: `late` is null for that reason. */
  noHistory?: boolean;
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
  const abroadSet = new Set(q.toForeign);
  const fromAbroadSet = new Set(q.fromForeign ?? []);
  const hits: RouteHit[] = [];
  for (const [type, num, stops, fi, oi] of idx.raw.trains) {
    let best: { i: number; j: number; score: number; viaFrom: boolean; viaTo: boolean } | null = null;
    // A train whose stops abroad are not in the data (not found in the timetables abroad) still has its real origin
    // or final destination as a label: boarding there means boarding at the first German stop the data has, getting
    // off there is measured at the last one.
    const endSt = fi !== undefined && fi !== null ? idx.labelStation[fi] : -1;
    const startSt = oi !== undefined && oi !== null ? idx.labelStation[oi] : -1;
    const inline = (st: number) => st >= 0 && stops.some((s) => s[0] === st);
    const viaFrom = (fromAbroadSet.size > 0 && oi !== undefined && oi !== null && fromAbroadSet.has(oi)) || (startSt >= 0 && fromSet.has(startSt) && !inline(startSt));
    const viaTo = (fi !== undefined && fi !== null && abroadSet.has(fi)) || (endSt >= 0 && toSet.has(endSt) && !inline(endSt));
    for (let i = 0; i < stops.length; i++) {
      const boardHere = viaFrom ? i === 0 : fromSet.has(stops[i][0]);
      if (!boardHere || stops[i][1] === null) continue;
      const consider = (j: number, viaToHere: boolean) => {
        if (j <= i || stops[j][2] === null || stops[j][8] <= stops[i][8]) return;
        const score = idx.weight[stops[i][0]] + idx.weight[stops[j][0]];
        if (!best || score > best.score) best = { i, j, score, viaFrom: viaFrom && i === 0, viaTo: viaToHere };
      };
      for (let j = i + 1; j < stops.length; j++) if (toSet.has(stops[j][0])) consider(j, false);
      if (viaTo) consider(stops.length - 1, true);
    }
    if (!best) continue;
    const found = best as { i: number; j: number; viaFrom: boolean; viaTo: boolean };
    const a = stops[found.i];
    const b = stops[found.j];
    const toCc = found.viaTo ? null : countryOf(idx, b[0]);
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
      hops: found.j - found.i,
      abroad: found.viaTo,
      fromAbroad: found.viaFrom,
      fromCc: found.viaFrom ? null : countryOf(idx, a[0]),
      toCc,
      noHistory: !found.viaTo && !hasHistory(idx, b[0]),
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
