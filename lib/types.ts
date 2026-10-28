/**
 * Data contract between scripts/compute.py (producer) and the Next.js site (consumer).
 * Every number on the site comes from these JSON files. Do not invent fields.
 *
 * Files:
 *   data/stats.json          -> Stats
 *   data/monthly.json        -> Monthly
 *   data/trains/<slug>.json  -> TrainDetail   (one per train in the top 25 of either ranking)
 *
 * Units: delays in minutes, shares and percentages in percent (0-100), one decimal place
 * unless noted. Months are "YYYY-MM". Slugs are lowercase with a hyphen: "NJ 40490" -> "nj-40490".
 */

export type Mode = "minutes" | "percent";

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
  trainTypes: string[];
  minRunsForPool: number;
  clampMinMinutes: number;
  clampMaxMinutes: number;
  minScheduledMinutesForPct: number;
  minStationsForFullMonth: number;
  minStationArrivals: number;
  lateThresholdMinutes: number;
  topN: number;
  moreN: number;
}

/** Four-number summary of a delay distribution. */
export interface Dist {
  avg: number;
  sd: number;
  median: number;
  p90: number;
}

export interface Overall {
  /** All long-distance runs in the window (including fully cancelled ones). */
  runs: number;
  /** Runs with a measured, un-clamped final delay. */
  measuredRuns: number;
  /** Runs dropped because the final delay was outside the clamp. */
  droppedByClamp: number;
  avgDelayMin: number;
  medianDelayMin: number;
  avgDelayPct: number;
  fullCancelPct: number;
  /** Distinct trains seen. */
  trains: number;
  /** Trains with >= minRunsForPool measured runs (the ranking pool). */
  poolSize: number;
}

/** One row of a leaderboard. Everything a card needs. */
export interface TrainSummary {
  slug: string;
  /** "NJ 40490" */
  train: string;
  type: string;
  number: string;
  /** Other train numbers with identical measured runs (the same physical train), e.g. ["EN 40417"]. */
  alsoRunsAs: string[];
  /** Most common first stop in the data. */
  origin: string;
  /** Most common final destination (international trains are measured at the last German stop). */
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
  /** 1-based rank in each ranking over the pool, or null when outside the stored top lists. */
  rank: { minutes: number | null; percent: number | null };
}

export interface MonthAvg {
  month: string;
  runs: number;
  /** null when the train had no measured run that month. */
  avg: number | null;
}

export interface HistBin {
  /** Display label, e.g. "<0", "0-5", "120+". */
  label: string;
  /** Inclusive lower bound in minutes, null for the open-ended "<0" bin. */
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

export interface TrainDetail extends TrainSummary {
  monthly: MonthAvg[];
  histogram: HistBin[];
  /** Ordered stops of the most common stop sequence, from the most common origin->dest variant. */
  stops: Stop[];
  /** Number of runs that used exactly this stop sequence. */
  stopsSequenceRuns: number;
  worstRun: WorstRun | null;
}

export interface Station {
  name: string;
  lat: number;
  lon: number;
  /** Measured arrivals. */
  n: number;
  /** Mean arrival delay in minutes. */
  avg: number;
  /** Percent of arrivals >= lateThresholdMinutes late. */
  late: number;
}

export interface Extras {
  /** Lowest average delay in the pool. */
  bestBehaved: ExtraTrain;
  /** Highest full-cancellation share in the pool. */
  mostCancelled: ExtraTrain;
  /** Worst single month for any train in the top 10 of either ranking (>= 10 measured runs that month). */
  worstTrainMonth: { slug: string; train: string; month: string; avg: number; runs: number } | null;
  /** The single worst run that passes the clamp. */
  worstRun: (WorstRun & { slug: string | null; train: string }) | null;
}

export interface ExtraTrain {
  slug: string;
  train: string;
  origin: string;
  dest: string;
  measured: number;
  avgMin: number;
  fullCancelPct: number;
}

export interface Stats {
  generatedAt: string;
  window: WindowInfo;
  params: Params;
  overall: Overall;
  /**
   * Ranked lists. Each list has `moreN` entries (best first); the first `topN` are the headline top list.
   * Both lists store summaries only; details live in data/trains/<slug>.json.
   */
  rankings: { minutes: TrainSummary[]; percent: TrainSummary[] };
  extras: Extras;
  /** Stations with >= minStationArrivals measured arrivals, sorted by name. */
  stations: Station[];
}

export interface MonthPoint {
  month: string;
  /** All long-distance runs scheduled to depart that month. */
  runs: number;
  measured: number;
  avgDelayMin: number;
  medianDelayMin: number;
  avgDelayPct: number;
  fullCancelPct: number;
  /** Average delay before the clamp, for the reference comparison. */
  avgDelayMinUnclamped: number;
  droppedByClamp: number;
}

export interface Monthly {
  generatedAt: string;
  window: WindowInfo;
  months: MonthPoint[];
}
