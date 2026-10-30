/**
 * Connection odds, browser side: the ladder for one station (planned change time -> how often the change worked).
 * Data: data/connections.json (scripts/connections.py), copied to /search/connections.json. No I/O except the fetch.
 */
import { fold, words } from "./typeahead";

/** [planned change time (min), pairs of trains, next train cancelled, worked with 0 / 2 / 4 / 6 / 8 min to spare] */
export type GapRow = [number, number, number, number, number, number, number, number];

export interface ConnStation {
  name: string;
  runs: number;
  gaps: GapRow[];
}

export interface ConnFile {
  window: { firstMonth: string; lastMonth: string; monthCount: number };
  params: { walk: number[]; minN: number; minGap: number; maxGap: number };
  stations: ConnStation[];
}

/** The two settings: most people need a couple of minutes; "I need more time" asks for six. */
export const WALK_FAST = 2;
export const WALK_SLOW = 6;
/** Change times shown as rows. The ones people see in their app are 3 to 15 minutes, and 20 for the relaxed. */
export const LADDER = [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20];
/** Stations offered as buttons before anything is typed (names as in the data). */
export const BUSY = ["Berlin Hauptbahnhof", "München Hbf", "Frankfurt (Main) Hbf", "Hannover Hbf", "Köln Hbf", "Hamburg Hbf"];

export interface LadderRow {
  gap: number;
  n: number;
  /** Changes that worked with `walk` minutes to spare. */
  ok: number;
  cancelled: number;
  /** Share (0-100) of changes that worked. */
  pct: number;
  cancelledPct: number;
}

export function ladder(st: ConnStation, walk: number, walks: number[]): LadderRow[] {
  const k = walks.indexOf(walk);
  const col = 3 + (k < 0 ? 1 : k);
  const by = new Map(st.gaps.map((g) => [g[0], g]));
  const rows: LadderRow[] = [];
  for (const gap of LADDER) {
    const g = by.get(gap);
    if (!g) continue;
    rows.push({ gap, n: g[1], ok: g[col], cancelled: g[2], pct: (100 * g[col]) / g[1], cancelledPct: (100 * g[2]) / g[1] });
  }
  return rows;
}

export function findStation(file: ConnFile, name: string): ConnStation | null {
  return file.stations.find((s) => s.name === name) ?? null;
}

function prefixes(q: string[], name: string[]): boolean {
  const used = new Set<number>();
  return q.every((qw) => {
    const i = name.findIndex((nw, idx) => !used.has(idx) && nw.startsWith(qw));
    if (i < 0) return false;
    used.add(i);
    return true;
  });
}

/** Stations whose name starts with every typed word ("koln", "cologne", "frankfurt hbf"), busiest first. */
export function matchStations(file: ConnFile, input: string, limit = 5): ConnStation[] {
  const q = words(fold(input));
  if (q.length === 0) return [];
  return file.stations
    .filter((s) => prefixes(q, words(fold(s.name))))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, limit);
}

let loading: Promise<ConnFile> | undefined;

/** About 50 kB gzipped; fetched the first time the card is used. */
export function loadConnections(): Promise<ConnFile> {
  if (!loading) {
    loading = fetch("/search/connections.json").then((r) => {
      if (!r.ok) throw new Error(`connections ${r.status}`);
      return r.json() as Promise<ConnFile>;
    });
    loading.catch(() => {
      loading = undefined;
    });
  }
  return loading;
}

// ---------------------------------------------------------------- the setting, remembered on the phone

const KEY_STATION = "gp-conn-station";
const KEY_SLOW = "gp-conn-slow";

export function readStation(): string | null {
  try {
    return window.localStorage.getItem(KEY_STATION);
  } catch {
    return null;
  }
}
export function writeStation(name: string): void {
  try {
    window.localStorage.setItem(KEY_STATION, name);
  } catch {
    // private mode: the choice just is not remembered
  }
}
export function readSlow(): boolean {
  try {
    return window.localStorage.getItem(KEY_SLOW) === "1";
  } catch {
    return false;
  }
}
export function writeSlow(v: boolean): void {
  try {
    window.localStorage.setItem(KEY_SLOW, v ? "1" : "0");
  } catch {
    // ignore
  }
}
