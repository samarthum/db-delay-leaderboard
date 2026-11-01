import ORIGINS from "../data/foreign-origins.json";

/**
 * Trains that come into Germany from abroad: the real first station (DB's own timetable) and the first German stop,
 * where our data (and the delay figures) begin. data/foreign-origins.json, written by scripts/foreign_origins.mjs.
 */
const O = ORIGINS as unknown as Record<string, [string, string]>;

/** "Amsterdam Centraal" for ICE 221, else null. */
export function foreignOrigin(name: string): { origin: string; border: string } | null {
  const v = O[name];
  return v ? { origin: v[0], border: v[1] } : null;
}

/** The origin to show: the real one abroad when known. */
export function shownOrigin(name: string, dataOrigin: string): string {
  return O[name]?.[0] ?? dataOrigin;
}
