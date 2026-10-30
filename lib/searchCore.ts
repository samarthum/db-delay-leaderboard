/**
 * Train search without I/O: parse what a visitor typed, match it against the records of a shard, and
 * suggest fixes for typos. The records are written by scripts/compute.py into data/search/.
 *
 * A record is a positional array (see search_units in compute.py):
 *   [type, num, kind, runs, measured, avg, late, cancelled, weekday, origin, dest, worst, slug, hash, lineHash, line, late6]
 */

/** 0: a long-distance train number ("ICE 1541"), 1: a regional line ("RE 19"), 2: a regional train number ("RE 4930"). */
export type Kind = 0 | 1 | 2;

export interface SearchUnit {
  /** Train type ("ICE") or line prefix ("RE"). */
  type: string;
  /** Train number ("1541"), or the line's number ("19", "6a"). */
  num: string;
  kind: Kind;
  /** Scheduled runs in the window, cancelled ones included. */
  runs: number;
  /** Runs with a measured arrival delay. */
  measured: number;
  /** Mean arrival delay in minutes. */
  avg: number;
  /** Percent of measured runs that arrived at least `lateMinutes` late. */
  late: number;
  /** Percent of measured runs 6+ min late: Deutsche Bahn's own rule. */
  late6: number | null;
  /** Percent of runs that were cancelled entirely. */
  cancelled: number;
  /** Mean delay per weekday, Monday first. null where there were too few measured runs. */
  weekday: (number | null)[];
  origin: string;
  dest: string;
  worst: { date: string; delay: number; origin: string | null; dest: string | null };
  /** Slug of the full page, when the train or line has one. */
  slug: string | null;
  /** Tells apart lines and regional trains that share a type and number. */
  hash: string | null;
  /** The hash of the line a regional train runs on. */
  lineHash: string | null;
  /** The line a regional train runs on, "RE 19". */
  line: string | null;
  /** Stable id for the URL. */
  key: string;
}

export type RawUnit = [
  string,
  string,
  Kind,
  number,
  number,
  number,
  number,
  number,
  (number | null)[],
  string,
  string,
  [string, number] | [string, number, string, string],
  (string | null)?,
  (string | null)?,
  (string | null)?,
  (string | null)?,
  (number | null)?,
];

const PREFIX: Record<Kind, string> = { 0: "", 1: "line-", 2: "rt-" };

export function unitKey(kind: Kind, type: string, num: string, hash: string | null): string {
  return `${PREFIX[kind]}${type}-${num}${hash ? `.${hash}` : ""}`.toLowerCase();
}

export function lineKey(type: string, num: string, hash: string): string {
  return unitKey(1, type, num, hash);
}

export function decode(r: RawUnit): SearchUnit {
  const [type, num, kind, runs, measured, avg, late, cancelled, weekday, origin, dest, worst] = r;
  const hash = r[13] ?? null;
  return {
    type,
    num,
    kind,
    runs,
    measured,
    avg,
    late,
    late6: r[16] ?? null,
    cancelled,
    weekday,
    origin,
    dest,
    worst: { date: worst[0], delay: worst[1], origin: worst[2] ?? null, dest: worst[3] ?? null },
    slug: r[12] ?? null,
    hash,
    lineHash: r[14] ?? null,
    line: r[15] ?? null,
    key: unitKey(kind, type, num, hash),
  };
}

export function unitName(u: Pick<SearchUnit, "type" | "num">): string {
  return `${u.type} ${u.num}`;
}

// ---------------------------------------------------------------- parsing

export interface Parsed {
  /** What the visitor typed, trimmed. */
  raw: string;
  /** Upper-case train type, "ICE", when one was typed. */
  type: string | null;
  /** Upper-case number, "1541" or "6A", when one was typed. */
  num: string | null;
  /** Words that were left over (a station name, say). */
  extra: string[];
}

const TYPE_ALIASES: Record<string, string> = {
  INTERCITY: "IC",
  EUROCITY: "EC",
  FLIXTRAIN: "FLX",
  FLIX: "FLX",
  RAILJET: "RJ",
  WESTBAHN: "WB",
  REGIONALEXPRESS: "RE",
  REGIONALBAHN: "RB",
  IRE: "IRE",
};

/** Types the site leaves out on purpose, so the answer can say so instead of "no match". */
export type UnsupportedKind = "sbahn" | "ubahn" | "night" | "bus" | "tram" | "replacement";

export const UNSUPPORTED_TYPES: Record<string, UnsupportedKind> = {
  S: "sbahn",
  U: "ubahn",
  NJ: "night",
  EN: "night",
  BUS: "bus",
  STR: "tram",
  SEV: "replacement",
};

export function parseQuery(input: string): Parsed {
  const raw = input.trim().replace(/\s+/g, " ");
  const upper = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  const tokens = upper.match(/\d+[A-Z]?|[A-Z]+/g) ?? [];
  let type: string | null = null;
  let num: string | null = null;
  const extra: string[] = [];
  for (const t of tokens) {
    const isNum = /^\d/.test(t);
    if (isNum && num === null) num = t;
    else if (!isNum && type === null) type = TYPE_ALIASES[t] ?? t;
    else extra.push(t);
  }
  return { raw, type, num, extra };
}

/**
 * Words that ask about right now ("ICE 1541 today", "Verspätung heute"). This site is a record, not live, so they are
 * taken out of the query and the page says so, instead of answering a question nobody asked or calling "Verspätung" a train type.
 */
const LIVE_WORDS = new Set(["today", "now", "live", "currently", "heute", "jetzt", "aktuell", "gerade", "verspatung", "verspaetung", "delay", "delayed", "late", "tonight", "heutige"]);

export function splitLive(input: string): { text: string; live: boolean } {
  const words = input.trim().split(/\s+/).filter(Boolean);
  const fold = (w: string) => w.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const kept = words.filter((w) => !LIVE_WORDS.has(fold(w)));
  return { text: kept.join(" "), live: kept.length !== words.length };
}

/** Shards are keyed by the first two digits of a number. */
export function shardKey(num: string): string {
  const digits = /^\d*/.exec(num)?.[0] ?? "";
  return digits.slice(0, 2) || "_";
}

// ---------------------------------------------------------------- matching

export function numEquals(u: SearchUnit, num: string): boolean {
  return u.num.toUpperCase() === num;
}

/** Most scheduled runs first, then the stable key. */
export function byImportance(a: SearchUnit, b: SearchUnit): number {
  return b.measured - a.measured || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
}

export function exactMatches(units: SearchUnit[], parsed: Parsed): SearchUnit[] {
  if (parsed.num === null) return [];
  const num = parsed.num;
  return units
    .filter((u) => numEquals(u, num) && (parsed.type === null || u.type === parsed.type))
    .sort(byImportance);
}

/** Numbers that start with what was typed ("154" -> 1541, 1542, ...). Needs two digits. */
export function prefixMatches(units: SearchUnit[], parsed: Parsed, limit = 6): SearchUnit[] {
  const num = parsed.num;
  if (num === null || !/^\d{2,}$/.test(num)) return [];
  return units
    .filter((u) => u.num.toUpperCase().startsWith(num) && !numEquals(u, num) && (parsed.type === null || u.type === parsed.type))
    .sort(byImportance)
    .slice(0, limit);
}

// ---------------------------------------------------------------- typos

/** True when a and b differ by one substitution, one insertion, one deletion or one swap of neighbours. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/** The known types within one edit of what was typed: "ICEE" -> ICE, "IEC" -> ICE, "RR" -> RE, RB. */
export function similarTypes(type: string, known: string[]): string[] {
  if (known.includes(type)) return [];
  return known.filter((k) => withinOneEdit(type, k));
}

export interface NumSuggestion {
  type: string;
  num: string;
  /** Lower is closer: 0 swap, 1 changed digit, 2 missing digit, 3 extra digit. */
  distance: number;
}

/**
 * Numbers within one edit of `num` that exist, per type. `known` maps a type to the set of its numbers.
 * Order: swapped neighbours, a changed digit, a missing digit, an extra digit, then long-distance types first.
 */
export function numberSuggestions(
  num: string,
  type: string | null,
  known: Map<string, Set<string>>,
  longDistance: string[],
  limit = 6,
): NumSuggestion[] {
  const m = /^(\d+)([A-Z]?)$/.exec(num);
  if (!m) return [];
  const [, digits, suffix] = m;
  const lowerSuffix = suffix.toLowerCase();
  const variants = new Map<string, number>();
  const add = (d: string, distance: number) => {
    if (d.length === 0 || d === digits) return;
    if (!variants.has(d) || (variants.get(d) as number) > distance) variants.set(d, distance);
  };
  for (let i = 0; i < digits.length - 1; i++) {
    if (digits[i] !== digits[i + 1]) add(digits.slice(0, i) + digits[i + 1] + digits[i] + digits.slice(i + 2), 0);
  }
  for (let i = 0; i < digits.length; i++) {
    for (let c = 0; c < 10; c++) add(digits.slice(0, i) + c + digits.slice(i + 1), 1);
    add(digits.slice(0, i) + digits.slice(i + 1), 2);
  }
  for (let i = 0; i <= digits.length; i++) {
    for (let c = 0; c < 10; c++) add(digits.slice(0, i) + c + digits.slice(i), 3);
  }
  const out: NumSuggestion[] = [];
  for (const [t, set] of known) {
    if (type !== null && t !== type) continue;
    for (const [d, distance] of variants) {
      for (const candidate of suffix ? [d + lowerSuffix, d] : [d]) {
        if (set.has(candidate)) out.push({ type: t, num: candidate, distance });
      }
    }
  }
  const ld = new Set(longDistance);
  out.sort(
    (a, b) =>
      a.distance - b.distance ||
      Number(ld.has(b.type)) - Number(ld.has(a.type)) ||
      Math.abs(Number(a.num.replace(/\D/g, "")) - Number(digits)) - Math.abs(Number(b.num.replace(/\D/g, "")) - Number(digits)) ||
      (a.type + a.num < b.type + b.num ? -1 : 1),
  );
  return out.slice(0, limit);
}

// ---------------------------------------------------------------- weekdays


/** The days with the highest and lowest mean delay, or null when fewer than two days have data. */
export function weekdayExtremes(weekday: (number | null)[]): { worst: number; best: number } | null {
  const days = weekday.map((v, i) => ({ v, i })).filter((d): d is { v: number; i: number } => d.v !== null);
  if (days.length < 2) return null;
  const worst = days.reduce((a, b) => (b.v > a.v ? b : a));
  const best = days.reduce((a, b) => (b.v < a.v ? b : a));
  if (worst.v === best.v) return null;
  return { worst: worst.i, best: best.i };
}
