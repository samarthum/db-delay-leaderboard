/**
 * One delay colour scale for the whole site (map lines, station dots, route strips, chart accents).
 * Buckets are on average delay in minutes. Never use colour alone: pair with numbers or labels.
 */
export interface DelayBucket {
  /** Inclusive lower bound in minutes. */
  from: number;
  color: string;
  /** Text colour that passes contrast on top of `color`. */
  on: string;
  label: string;
}

export const DELAY_SCALE: readonly DelayBucket[] = [
  { from: -Infinity, color: "#34c36b", on: "#06210f", label: "under 5 min" },
  { from: 5, color: "#a6d43a", on: "#1B2410", label: "5 to 10" },
  { from: 10, color: "#ffc72c", on: "#2B2000", label: "10 to 20" },
  { from: 20, color: "#ff8a2b", on: "#2B1100", label: "20 to 35" },
  { from: 35, color: "#ff4b3e", on: "#2a0300", label: "35 to 50" },
  { from: 50, color: "#ff3d8b", on: "#2a0010", label: "50+ min" },
] as const;

/**
 * Station map scale: one heat ramp, light to dark, on a station's average arrival delay.
 * Stations average far less than single trains, so the steps are tighter than DELAY_SCALE.
 */
export const STATION_SCALE: readonly { from: number; color: string; label: string }[] = [
  { from: -Infinity, color: "#46d081", label: "under 2" },
  { from: 2, color: "#ffc72c", label: "2 to 4" },
  { from: 4, color: "#ff8a2b", label: "4 to 6" },
  { from: 6, color: "#ff4b3e", label: "6 to 8" },
  { from: 8, color: "#ff3d8b", label: "8+ min" },
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

/** Colour for a share of trips that arrive 15+ min late. Never used alone: always next to the number. */
export function lateShareColor(pct: number): string {
  if (pct < 10) return "#34c36b";
  if (pct < 20) return "#a6d43a";
  if (pct < 35) return "#ffc72c";
  if (pct < 55) return "#ff8a2b";
  return "#ff4b3e";
}
