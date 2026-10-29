/**
 * Typeahead over trains, lines and stations, with no I/O and no model: a prefix and token matcher on
 * names folded to plain letters. Station aliases cover the English and local spellings people type.
 * The index is written by scripts/copy-search.mjs into public/search/ta.json.
 *
 * Raw layout (compact on purpose):
 *   trains:   [type, num, kind, latePct, measured, origin, dest, key]   kind 0 train, 1 line
 *   stations: [name, [index into trains, ...]]
 */

export type TaTrain = [string, string, 0 | 1, number, number, string, string, string];
export type TaStation = [string, number[]];
export interface TaRaw {
  trains: TaTrain[];
  stations: TaStation[];
}

/** Lower case, no accents, German umlauts spelled the way people type them on a phone. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ß/g, "ss")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** What people type -> the name used in the data (folded). "ae/oe/ue" spellings are handled in `words`. */
const ALIASES: Record<string, string> = {
  cologne: "koln",
  munich: "munchen",
  nuremberg: "nurnberg",
  hanover: "hannover",
  vienna: "wien",
  zurich: "zurich",
  prague: "praha",
  brussels: "bruxelles",
  brussel: "bruxelles",
  cologne_: "koln",
  frankfurt: "frankfurt",
  ffm: "frankfurt",
  hbf: "hbf",
  bahnhof: "hbf",
  airport: "flughafen",
  frankfurt_main: "frankfurt",
  nuremburg: "nurnberg",
  dusseldorf: "dusseldorf",
  duesseldorf: "dusseldorf",
  koeln: "koln",
  muenchen: "munchen",
  nuernberg: "nurnberg",
  hannover: "hannover",
  hamburg: "hamburg",
  hauptbahnhof: "hbf",
  central: "hbf",
  main: "main",
  kassel: "kassel",
  copenhagen: "kobenhavn",
  kopenhagen: "kobenhavn",
  warsaw: "warszawa",
  warschau: "warszawa",
  milan: "milano",
  mailand: "milano",
  venice: "venezia",
  venedig: "venezia",
  antwerp: "antwerpen",
  ostend: "oostende",
  prag: "praha",
  cracow: "krakow",
};

/** Words of a folded string, with "ae/oe/ue" and "ss" spellings also mapped onto the folded form. */
export function words(folded: string): string[] {
  return folded
    .split(" ")
    .filter(Boolean)
    .map((w) => {
      const a = ALIASES[w];
      if (a) return a;
      // "muenchen" -> "munchen", "koeln" -> "koln", "nuernberg" -> "nurnberg"
      return w.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
    });
}

export interface TaTrainEntry {
  type: string;
  num: string;
  kind: 0 | 1;
  late: number;
  measured: number;
  origin: string;
  dest: string;
  key: string;
  name: string;
  /** "ice1541" for matching "ice 1541", "ice1541" and "1541". */
  compact: string;
}

export interface TaStationEntry {
  name: string;
  words: string[];
  trains: number[];
  /** Hbf and big hubs first: more trains, then a main station. */
  weight: number;
}

export interface TaIndex {
  trains: TaTrainEntry[];
  stations: TaStationEntry[];
}

export function buildIndex(raw: TaRaw): TaIndex {
  const trains = raw.trains.map(([type, num, kind, late, measured, origin, dest, key]) => ({
    type,
    num,
    kind,
    late,
    measured,
    origin,
    dest,
    key,
    name: `${type} ${num}`,
    compact: `${type}${num}`.toLowerCase(),
  }));
  const stations = raw.stations.map(([name, ts]) => {
    const w = words(fold(name));
    return { name, words: w, trains: ts, weight: ts.length + (w.includes("hbf") ? 6 : 0) };
  });
  return { trains, stations };
}

export type Suggestion =
  | { kind: "train"; train: TaTrainEntry }
  | { kind: "line"; train: TaTrainEntry }
  | { kind: "station"; station: TaStationEntry };

export interface Suggestions {
  trains: Suggestion[];
  lines: Suggestion[];
  stations: Suggestion[];
}

const MAX_EACH = 4;

/** True when every query word is the start of a different word of the name. */
function matchWords(q: string[], name: string[]): boolean {
  const used = new Set<number>();
  return q.every((qw) => {
    const i = name.findIndex((nw, idx) => !used.has(idx) && nw.startsWith(qw));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

export function suggest(index: TaIndex, input: string): Suggestions {
  const out: Suggestions = { trains: [], lines: [], stations: [] };
  const folded = fold(input);
  if (!folded) return out;
  const q = words(folded);

  // Train or line: "ice 15", "ice1541", "1541", "re 1", "re19".
  const compact = folded.replace(/\s+/g, "");
  const m = /^([a-z]*)(\d*)$/.exec(compact);
  if (m && (m[1] || m[2])) {
    const [, type, digits] = m;
    const hits = index.trains
      .filter((t) => {
        if (type && !t.type.toLowerCase().startsWith(type)) return false;
        if (digits && !t.num.toLowerCase().startsWith(digits)) return false;
        return Boolean(digits) || type.length >= 2 || t.type.toLowerCase() === type;
      })
      .sort((a, b) => {
        const exactA = Number(a.compact === compact);
        const exactB = Number(b.compact === compact);
        return exactB - exactA || Number(a.type.length === type.length) - Number(b.type.length === type.length) || b.measured - a.measured;
      });
    for (const t of hits) {
      const bucket = t.kind === 0 ? out.trains : out.lines;
      if (bucket.length < MAX_EACH) bucket.push({ kind: t.kind === 0 ? "train" : "line", train: t });
    }
  }

  // Station: every typed word starts a word of the name. Needs two letters so "e" doesn't list the map.
  if (folded.length >= 2 && !/^\d/.test(folded)) {
    const hits = index.stations
      .filter((s) => matchWords(q, s.words))
      .sort((a, b) => {
        const first = (s: TaStationEntry) => Number(s.words[0]?.startsWith(q[0]) ?? false);
        return first(b) - first(a) || b.weight - a.weight || a.name.localeCompare(b.name, "de");
      })
      .slice(0, MAX_EACH);
    for (const s of hits) out.stations.push({ kind: "station", station: s });
  }
  return out;
}

export function flatten(s: Suggestions): Suggestion[] {
  return [...s.trains, ...s.lines, ...s.stations];
}

/** The one station a query names exactly (after folding), for "Köln Hbf" or "cologne hbf". */
export function findStation(index: TaIndex, input: string): TaStationEntry | null {
  const q = words(fold(input));
  if (q.length === 0) return null;
  const exact = index.stations.filter((s) => s.words.length === q.length && s.words.every((w, i) => w === q[i]));
  if (exact.length > 0) return exact.sort((a, b) => b.weight - a.weight)[0];
  const starts = index.stations.filter((s) => matchWords(q, s.words));
  if (starts.length === 1) return starts[0];
  // "Köln" alone: the Hbf is the station people mean.
  const hbf = starts.filter((s) => s.words.includes("hbf") && s.words[0] === q[0]);
  return hbf.length === 1 ? hbf[0] : null;
}
