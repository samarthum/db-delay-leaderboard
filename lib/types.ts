/**
 * Data contract between scripts/compute.py (producer) and the Next.js site (consumer).
 * Every number on the site comes from these JSON files. Do not invent fields.
 *
 * Files:
 *   data/stats.json          -> Stats
 *   data/monthly.json        -> Monthly
 *   data/stations.json       -> StationsFile
 *   data/trains/<slug>.json  -> UnitDetail   (long-distance trains in the top 25 of either ranking)
 *   data/lines/<slug>.json   -> UnitDetail   (regional lines in the top 25 of either ranking)
 *   data/search/*.json       -> the train search index: index.json, s-<digits>.json shards, n-<type>.json
 *                               (record layout in lib/searchCore.ts, written by search_units in compute.py)
 *
 * Units: delays in minutes, shares and percentages in percent (0-100), one decimal place
 * unless noted. Months are "YYYY-MM". Train slugs: "ICE 1541" -> "ice-1541". Line slugs add the
 * end stations: "re-19-duesseldorf-hbf-arnhem-centraal".
 */

export type Mode = "minutes" | "percent";

/** Long-distance trains are ranked per train number, regional trains per line. */
export type Category = "longDistance" | "regional";

export interface WindowInfo {
  firstMonth: string;
  lastMonth: string;
  monthCount: number;
  /** Months in the window, ascending. */
  months: string[];
  /** Months that were published but left out, with the reason. */
  skipped: SkippedMonth[];
  /**
   * The latest-12 listing of published monthly files (month + byte size) the window was chosen from.
   * The refresh workflow recomputes only when the live listing differs from this.
   */
  published: { month: string; bytes: number }[];
}

export interface SkippedMonth {
  month: string;
  reason: string;
  /** Distinct stations seen in that month (coverage check). */
  stations: number;
}

/** Thresholds and rules actually used by the run. Shown in the methodology section. */
export interface Params {
  longDistanceTypes: string[];
  /** Left out everywhere. */
  nightTrainTypes: string[];
  /** Line code prefixes counted as regional ("RE" in "RE 19"). */
  regionalLinePrefixes: string[];
  /** Measured trips a long-distance train needs to be ranked. */
  minRunsForPool: number;
  /** Measured trips a regional line needs to be ranked. */
  minRunsForLinePool: number;
  clampMinMinutes: number;
  clampMaxMinutes: number;
  minScheduledMinutesForPct: number;
  minStationsForFullMonth: number;
  /** Measured arrivals a station needs to be on the map. */
  minStationArrivals: number;
  /** Measured arrivals that make a station "big" for the list under the map. */
  bigStationMinArrivals: number;
  /** The headline covers the last this many window months. */
  headlineMonths: number;
  topN: number;
  moreN: number;
  /** Measured runs a train number, line or regional train number needs to be searchable. */
  searchMinRuns: number;
  /** Below this many measured runs a search result carries a "few runs" warning. */
  searchFewRuns: number;
  /** Measured runs a weekday needs for its average to be shown in a search result. */
  searchMinWeekdayRuns: number;
  /** A run counts as late from this many minutes. */
  lateMinutes: number;
}

/** Four-number summary of a delay distribution. */
export interface Dist {
  avg: number;
  sd: number;
  median: number;
  p90: number;
}

export interface Overall {
  /** All runs of the category in the window (including fully cancelled ones). */
  runs: number;
  /** Runs with a measured, un-clamped final delay. */
  measuredRuns: number;
  /** Runs dropped because the final delay was outside the clamp. */
  droppedByClamp: number;
  avgDelayMin: number;
  medianDelayMin: number;
  avgDelayPct: number;
  fullCancelPct: number;
  /** Distinct train numbers or lines seen. */
  units: number;
  /** Trains or lines with enough measured runs to be ranked. */
  poolSize: number;
}

/** One row of a leaderboard. Everything a card needs. */
export interface UnitSummary {
  slug: string;
  category: Category;
  /** "ICE 1541" for a train, "RE 19" for a line. Two lines can share a name; the route tells them apart. */
  name: string;
  /** Train type ("ICE") or line code prefix ("RE"). */
  type: string;
  /** Other train numbers with identical measured runs (the same physical train), e.g. ["EN 40417"]. Empty for lines. */
  alsoRunsAs: string[];
  /**
   * Trains: most common first stop. Lines: one end of the most common pair of end stations,
   * in the direction the line ran more often.
   */
  origin: string;
  /** Trains: most common final destination (international trains are measured at the last German stop). */
  dest: string;
  routeVariants: number;
  runs: number;
  /** Runs with a measured delay in range. */
  measured: number;
  /** Runs also long enough (>= minScheduledMinutesForPct) to count in the % stats. */
  measuredPct: number;
  minutes: Dist;
  percent: Dist;
  /** Mean scheduled journey time in minutes (first departure to the measured final arrival). */
  avgScheduledMin: number;
  fullCancelPct: number;
  partialCancelPct: number;
  /** 1-based rank in each ranking of its category, or null when outside the stored top lists. */
  rank: { minutes: number | null; percent: number | null };
}

export interface MonthAvg {
  month: string;
  runs: number;
  /** null when there was no measured run that month. */
  avg: number | null;
}

export interface HistBin {
  /** Display label, e.g. "<0", "0-5", "120+". */
  label: string;
  /** Inclusive lower bound in minutes, null for the open-ended first bin. */
  lo: number | null;
  /** Exclusive upper bound in minutes, null for the open-ended last bin. */
  hi: number | null;
  count: number;
  /** Percent of measured runs. */
  share: number;
}

export interface Stop {
  eva: string;
  name: string;
  /** null when the station is missing from the Trainline coordinates file. */
  lat: number | null;
  lon: number | null;
  /** Mean delay in minutes at this stop (arrival delay; departure delay at the first stop). */
  avgDelay: number;
  n: number;
}

export interface WorstRun {
  /** ISO date (YYYY-MM-DD) of the scheduled first departure. */
  date: string;
  delayMin: number;
  origin: string;
  dest: string;
}

export interface UnitDetail extends UnitSummary {
  monthly: MonthAvg[];
  histogram: HistBin[];
  /** Ordered stops of the most common stop sequence, from the most common first->last stop pair. */
  stops: Stop[];
  /** Number of runs that used exactly this stop sequence. */
  stopsSequenceRuns: number;
  worstRun: WorstRun | null;
}

/** A typical trip in the last `Params.headlineMonths` months of the window. */
export interface HeadlineStats {
  runs: number;
  measured: number;
  avgDelayMin: number;
  avgDelayPct: number;
  fullCancelPct: number;
  /** Measured runs by how late they arrived: under 6, 6-15, 15-60, 60+ minutes. */
  bands: HistBin[];
}

export interface Headline {
  months: string[];
  categories: Record<Category, HeadlineStats>;
}

/** Whole-window counts for one category, for the recap card. */
export interface RecapCategory {
  runs: number;
  /** Runs cancelled entirely. */
  cancelled: number;
  measured: number;
  /** Measured runs that arrived `lateMinutes` or more late, and an hour or more late. */
  lateRuns: number;
  late60Runs: number;
  latePct: number;
  late60Pct: number;
  cancelledPct: number;
  avgDelayMin: number;
}

export interface Recap {
  longDistance: RecapCategory;
  regional: RecapCategory;
}

export interface Stats {
  generatedAt: string;
  window: WindowInfo;
  params: Params;
  headline: Headline;
  overall: Record<Category, Overall>;
  recap: Recap;
  /**
   * Ranked lists per category. Each list has `moreN` entries (worst first); the first `topN` are
   * the headline top list. Details live in data/trains/ and data/lines/.
   */
  rankings: Record<Category, Record<Mode, UnitSummary[]>>;
}

export interface Station {
  name: string;
  lat: number;
  lon: number;
  /** Measured arrivals of long-distance and regional trains. */
  n: number;
  /** Mean arrival delay in minutes. */
  avg: number;
}

export interface StationsFile {
  generatedAt: string;
  /** Stations with >= minStationArrivals measured arrivals and known coordinates, sorted by name. */
  stations: Station[];
}

export interface MonthPoint {
  month: string;
  /** All runs of the category scheduled to depart that month. */
  runs: number;
  measured: number;
  avgDelayMin: number;
  medianDelayMin: number;
  avgDelayPct: number;
  fullCancelPct: number;
  /** Average delay before the clamp. */
  avgDelayMinUnclamped: number;
  droppedByClamp: number;
}

export interface Monthly {
  generatedAt: string;
  window: WindowInfo;
  series: Record<Category, MonthPoint[]>;
}
