import type { RouteQuery, StopsIndex } from "./routeSearch";
import type { RouteTable } from "./searchClient";
import { routeSlug } from "./routeSlug";

/**
 * The route page a search should open: the page of the two main stations the text names ("Köln" and "Berlin" are
 * Köln Hbf and Berlin Hbf), or null. No page for those two stations means the search shows its own list, which covers
 * every station of the city: opening the page of some other Köln station instead would answer a question nobody asked.
 */
export function pageFor(idx: StopsIndex, q: RouteQuery, table: RouteTable): string | null {
  if (q.to.length === 0 || q.from.length === 0) return null;
  const slug = routeSlug(idx.raw.stations[q.from[0]], idx.raw.stations[q.to[0]]);
  return table[slug] ? slug : null;
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

/**
 * A row of a route's train list whose planned arrival comes more than 12 h after its departure is a train running the
 * other way (data/routes.json lists 241 such rows on 97 routes; a data-job bug, see ROADMAP). Never show those.
 */
export function runsThisWay(dep: number, arr: number): boolean {
  return (((arr - dep) % 1440) + 1440) % 1440 <= 720;
}
