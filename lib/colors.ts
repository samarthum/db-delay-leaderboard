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
  { from: -Infinity, color: "#2E9E5B", on: "#FFFFFF", label: "under 5 min" },
  { from: 5, color: "#8DBB2F", on: "#1B2410", label: "5 to 10" },
  { from: 10, color: "#F2B01E", on: "#2B2000", label: "10 to 20" },
  { from: 20, color: "#F26A21", on: "#2B1100", label: "20 to 35" },
  { from: 35, color: "#EC0016", on: "#FFFFFF", label: "35 to 50" },
  { from: 50, color: "#8E0010", on: "#FFFFFF", label: "50+ min" },
] as const;

/**
 * Station map scale: one heat ramp, light to dark, on a station's average arrival delay.
 * Stations average far less than single trains, so the steps are tighter than DELAY_SCALE.
 */
export const STATION_SCALE: readonly { from: number; color: string; label: string }[] = [
  { from: -Infinity, color: "#fed976", label: "under 2" },
  { from: 2, color: "#feb24c", label: "2 to 4" },
  { from: 4, color: "#fd8d3c", label: "4 to 6" },
  { from: 6, color: "#e31a1c", label: "6 to 8" },
  { from: 8, color: "#99000d", label: "8+ min" },
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
