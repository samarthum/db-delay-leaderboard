import { shardKey } from "./searchCore";

/**
 * The last 7 days of one train (data/last7.json from scripts/last7.py, split per number prefix into public/last7/ by
 * scripts/copy-search.mjs). A day is null (no run of this number in the data), "x" (the whole run cancelled), "?" (data
 * incomplete that day: never shown as a delay) or [departure, arrival] where each end is minutes late, "x" (that stop
 * cancelled) or null (not measured), plus the first and last stop names when they differ from the usual ones.
 */
export type End = number | "x" | null;
export type Day = null | "x" | "?" | [End, End] | [End, End, string | null, string | null];
export interface TrainWeek {
  /** Usual first and last German stop over the week. */
  o: string | null;
  d: string | null;
  c: Day[];
}
export interface WeekIndex {
  asOf: string;
  days: string[];
  gaps: Record<string, number[]>;
  shards: string[];
}

let indexP: Promise<WeekIndex | null> | null = null;
const shardP = new Map<string, Promise<Record<string, TrainWeek>>>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

/** The week's dates, or null when the site has no last-7-days data (file not built yet). */
export function loadWeekIndex(): Promise<WeekIndex | null> {
  if (!indexP) {
    indexP = getJson<WeekIndex>("/last7/index.json").then(
      (x) => (x && x.asOf && x.days.length ? x : null),
      () => null,
    );
  }
  return indexP;
}

/** One train's week: undefined when the data exists but this number had no run in it; null when there is no data. */
export async function loadTrainWeek(train: string): Promise<{ index: WeekIndex; week: TrainWeek | undefined } | null> {
  const index = await loadWeekIndex();
  if (!index) return null;
  const num = train.split(" ")[1] ?? "";
  const key = shardKey(num);
  if (!index.shards.includes(key)) return { index, week: undefined };
  let p = shardP.get(key);
  if (!p) {
    p = getJson<Record<string, TrainWeek>>(`/last7/${key}.json`);
    shardP.set(key, p);
    p.catch(() => shardP.delete(key));
  }
  const shard = await p;
  return { index, week: shard[train] };
}

export interface WeekSummary {
  /** Days with a measured arrival at the last stop. */
  arrDays: number;
  /** Average of those arrivals, minutes (can be below 0). */
  arrAvg: number | null;
  /** Of those, how many 15+ min late. */
  late15: number;
  /** Days with a cancellation: the whole run or one of its two ends. */
  cancelled: number;
  /** Days whose arrival was at another station than the usual last stop (not in the average). */
  elsewhere: number;
  /** Days with no run in the data, and days with incomplete data. */
  noRun: number;
  incomplete: number;
}

export function summarise(cells: Day[]): WeekSummary {
  const arr: number[] = [];
  let cancelled = 0;
  let noRun = 0;
  let incomplete = 0;
  let elsewhere = 0;
  for (const c of cells) {
    if (c === null) noRun++;
    else if (c === "?") incomplete++;
    else if (c === "x") cancelled++;
    else {
      if (c[0] === "x" || c[1] === "x") cancelled++;
      // Early counts as 0 (as the marks show it); a day that ended at another stop is not this stop's arrival.
      const other = c.length > 2 && c[3] !== null && c[3] !== undefined;
      if (typeof c[1] === "number" && !other) arr.push(Math.max(0, c[1]));
      if (other) elsewhere++;
    }
  }
  return {
    arrDays: arr.length,
    arrAvg: arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null,
    late15: arr.filter((x) => x >= 15).length,
    cancelled,
    elsewhere,
    noRun,
    incomplete,
  };
}

/** Monday = 0 ... Sunday = 6 for an ISO date, without the runtime's time zone. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Whole days from an ISO date to today in Berlin. */
export function daysSince(iso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round((Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) - Date.UTC(y, m - 1, d)) / 86400000);
}
