import index from "@/data/search/index.json";
import { buildIndex, type TaIndex, type TaRaw } from "./typeahead";
import { buildStops, type StopsIndex, type StopsRaw } from "./routeSearch";
import {
  UNSUPPORTED_TYPES,
  type UnsupportedKind,
  decode,
  exactMatches,
  numberSuggestions,
  parseQuery,
  prefixMatches,
  shardKey,
  similarTypes,
  type NumSuggestion,
  type Parsed,
  type RawUnit,
  type SearchUnit,
} from "./searchCore";

export const SEARCH_INDEX = index as {
  window: { firstMonth: string; lastMonth: string; monthCount: number };
  params: { searchMinRuns: number; searchFewRuns: number; searchMinWeekdayRuns: number; lateMinutes: number };
  counts: { train: number; line: number; regionalTrain: number };
  shards: Record<string, number>;
  types: Record<string, "longDistance" | "regional">;
};

const TYPES = Object.keys(SEARCH_INDEX.types);
const LONG_DISTANCE = TYPES.filter((t) => SEARCH_INDEX.types[t] === "longDistance");

const shardCache = new Map<string, Promise<SearchUnit[]>>();
const numsCache = new Map<string, Promise<Set<string>>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** All records whose number starts with these two digits. One small file, fetched once. */
export function loadShard(key: string): Promise<SearchUnit[]> {
  if (!(key in SEARCH_INDEX.shards)) return Promise.resolve([]);
  let p = shardCache.get(key);
  if (!p) {
    p = getJson<RawUnit[]>(`/search/s-${key}.json`).then((rows) => rows.map(decode));
    shardCache.set(key, p);
    p.catch(() => shardCache.delete(key));
  }
  return p;
}

function loadNums(type: string): Promise<Set<string>> {
  let p = numsCache.get(type);
  if (!p) {
    p = getJson<{ nums: string }>(`/search/n-${type}.json`).then((d) => new Set(d.nums.split(",")));
    numsCache.set(type, p);
    p.catch(() => numsCache.delete(type));
  }
  return p;
}

export interface SearchOutcome {
  parsed: Parsed;
  problem: null | "empty" | "need-number" | "unsupported";
  /** For problem "unsupported": what the typed type is ("S-Bahn"). */
  unsupported: UnsupportedKind | null;
  /** Exact matches, most measured runs first. */
  matches: SearchUnit[];
  /** A train type that was typed but does not exist: what was typed and the types used instead (none when ignored). */
  typeNote: { typed: string; used: string[] } | null;
  /** The same number under other types, when no match has the typed type. */
  sameNumber: SearchUnit[];
  /** Numbers that start with what was typed. */
  prefix: SearchUnit[];
  /** Numbers one edit away from what was typed. */
  typos: NumSuggestion[];
}

export async function runSearch(input: string): Promise<SearchOutcome> {
  const parsed = parseQuery(input);
  const out: SearchOutcome = {
    parsed,
    problem: null,
    unsupported: null,
    matches: [],
    typeNote: null,
    sameNumber: [],
    prefix: [],
    typos: [],
  };
  if (!parsed.raw) return { ...out, problem: "empty" };
  if (parsed.type && !(parsed.type in SEARCH_INDEX.types) && UNSUPPORTED_TYPES[parsed.type]) {
    return { ...out, problem: "unsupported", unsupported: UNSUPPORTED_TYPES[parsed.type] };
  }
  if (parsed.num === null) return { ...out, problem: "need-number" };

  const units = await loadShard(shardKey(parsed.num));
  const typeKnown = parsed.type === null || parsed.type in SEARCH_INDEX.types;
  let query: Parsed = parsed;
  if (typeKnown) {
    out.matches = exactMatches(units, parsed);
  } else {
    const similar = similarTypes(parsed.type as string, TYPES);
    query = { ...parsed, type: null };
    out.typeNote = { typed: parsed.type as string, used: similar };
    const all = exactMatches(units, query);
    out.matches = similar.length === 0 ? all : all.filter((u) => similar.includes(u.type));
  }
  if (out.matches.length > 0) return out;

  if (typeKnown && parsed.type !== null) out.sameNumber = exactMatches(units, query).slice(0, 6);
  out.prefix = prefixMatches(units, query);
  if (out.sameNumber.length === 0) {
    const types = typeKnown && parsed.type !== null ? [parsed.type] : TYPES;
    const sets = await Promise.all(types.map(async (t) => [t, await loadNums(t)] as const));
    out.typos = numberSuggestions(parsed.num, typeKnown ? parsed.type : null, new Map(sets), LONG_DISTANCE);
  }
  return out;
}

/** Find one record by its URL key, for a shared link that names a choice. */
export function pickByKey(matches: SearchUnit[], key: string | null): SearchUnit | null {
  return key ? (matches.find((u) => u.key === key) ?? null) : null;
}

/** The line a regional train runs on, loaded from its own shard. */
export async function loadLine(unit: SearchUnit): Promise<SearchUnit | null> {
  if (unit.kind !== 2 || !unit.line || !unit.lineHash) return null;
  const [type, num] = unit.line.split(" ");
  const units = await loadShard(shardKey(num));
  return units.find((u) => u.kind === 1 && u.type === type && u.num === num && u.hash === unit.lineHash) ?? null;
}

let typeahead: Promise<TaIndex> | undefined;

/** The typeahead index (trains, lines, stations). One small file, fetched the first time the box is used. */
export function loadTypeahead(): Promise<TaIndex> {
  if (!typeahead) {
    typeahead = getJson<TaRaw>("/search/ta.json").then(buildIndex);
    typeahead.catch(() => {
      typeahead = undefined;
    });
  }
  return typeahead;
}

let stops: Promise<StopsIndex> | undefined;

/** Per-stop data for route search (long-distance trains). About 450 kB gzipped, fetched when a route is first needed. */
export function loadStops(): Promise<StopsIndex> {
  if (!stops) {
    stops = getJson<StopsRaw>("/search/stops.json").then(buildStops);
    stops.catch(() => {
      stops = undefined;
    });
  }
  return stops;
}
