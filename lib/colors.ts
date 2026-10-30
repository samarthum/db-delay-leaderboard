/**
 * Colour only where it carries data. Four steps from safe to late; values are always written in ink, the colour sits
 * on the bar or dot next to the number, so contrast never depends on the data colour.
 */
export const SAFE = "#1d7a49";
export const FAIR = "#7f9a1c";
export const WARN = "#d46a00";
export const LATE = "#c42b1c";

export interface DelayBucket {
  /** Inclusive lower bound in minutes. */
  from: number;
  color: string;
  /** Text colour that passes contrast on top of `color`. */
  on: string;
  label: string;
}

/** Average delay in minutes. */
export const DELAY_SCALE: readonly DelayBucket[] = [
  { from: -Infinity, color: SAFE, on: "#ffffff", label: "under 5 min" },
  { from: 5, color: FAIR, on: "#ffffff", label: "5 to 15" },
  { from: 15, color: WARN, on: "#ffffff", label: "15 to 30" },
  { from: 30, color: LATE, on: "#ffffff", label: "30+ min" },
] as const;

/** Station map: a station's average arrival delay. Stations average far less than single trains, so the steps are tighter. */
export const STATION_SCALE: readonly { from: number; color: string; label: string }[] = [
  { from: -Infinity, color: SAFE, label: "under 2" },
  { from: 2, color: FAIR, label: "2 to 4" },
  { from: 4, color: WARN, label: "4 to 6" },
  { from: 6, color: LATE, label: "6+ min" },
] as const;

export function stationBucket(avgMinutes: number): number {
  let hit = 0;
  STATION_SCALE.forEach((b, i) => {
    if (avgMinutes >= b.from) hit = i;
  });
  return hit;
}

export function delayBucket(avgMinutes: number): DelayBucket {
  let hit = DELAY_SCALE[0];
  for (const b of DELAY_SCALE) if (avgMinutes >= b.from) hit = b;
  return hit;
}

export function delayColor(avgMinutes: number): string {
  return delayBucket(avgMinutes).color;
}

/** A share of trips that arrive 15+ min late (higher is worse): under 20 safe, 20 to 35, 35 to 50, 50 and up late. */
export function lateShareColor(pct: number): string {
  if (pct < 20) return SAFE;
  if (pct < 35) return FAIR;
  if (pct < 50) return WARN;
  return LATE;
}

/** A share of changes that worked (higher is better): 80 and up safe, 65 to 80, 50 to 65, under 50 late. */
export function successColor(pct: number): string {
  if (pct >= 80) return SAFE;
  if (pct >= 65) return FAIR;
  if (pct >= 50) return WARN;
  return LATE;
}
