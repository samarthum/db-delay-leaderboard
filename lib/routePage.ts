import type { RouteQuery, StopsIndex } from "./routeSearch";
import type { RouteTable } from "./searchClient";
import { routeSlug } from "./routeSlug";

/**
 * The route page a search should open: the page of the two main stations the text names ("Köln" and "Berlin" are
 * Köln Hbf and Berlin Hbf), else the busiest page among the other station pairs, else null (no page for this pair,
 * or the trip ends abroad: then the search shows its own result).
 */
export function pageFor(idx: StopsIndex, q: RouteQuery, table: RouteTable): string | null {
  if (q.to.length === 0 || q.from.length === 0) return null;
  const name = (i: number) => idx.raw.stations[i];
  const primary = routeSlug(name(q.from[0]), name(q.to[0]));
  if (table[primary]) return primary;
  let best: string | null = null;
  let bestTrips = -1;
  for (const a of q.from) {
    for (const b of q.to) {
      const slug = routeSlug(name(a), name(b));
      const e = table[slug];
      if (e && e.n > bestTrips) {
        best = slug;
        bestTrips = e.n;
      }
    }
  }
  return best;
}

/** 494 -> "08:14", for the ?t= part of a route page address. */
export function timeParam(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "08:14" -> 494, or null when it is not a time. */
export function parseTimeParam(value: string | null): number | null {
  const m = value ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
