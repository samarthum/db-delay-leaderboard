import fs from "node:fs";
import path from "node:path";
import type { Category, Monthly, RouteEntry, RoutesFile, Stats, StationsFile, UnitDetail } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CATEGORY_DIR: Record<Category, string> = { longDistance: "trains", regional: "lines" };

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), "utf8")) as T;
}

let statsCache: Stats | undefined;
let monthlyCache: Monthly | undefined;
let stationsCache: StationsFile | undefined;
const unitCache = new Map<string, UnitDetail>();
let routesCache: RoutesFile | undefined;

export function getStats(): Stats {
  return (statsCache ??= readJson<Stats>("stats.json"));
}

export function getMonthly(): Monthly {
  return (monthlyCache ??= readJson<Monthly>("monthly.json"));
}

export function getStations(): StationsFile {
  return (stationsCache ??= readJson<StationsFile>("stations.json"));
}

export function getUnit(category: Category, slug: string): UnitDetail {
  const key = `${category}/${slug}`;
  let u = unitCache.get(key);
  if (!u) {
    u = readJson<UnitDetail>(CATEGORY_DIR[category], `${slug}.json`);
    unitCache.set(key, u);
  }
  return u;
}

/** Slugs of every train or line with a detail page: the union of both stored rankings. */
export function getUnitSlugs(category: Category): string[] {
  const r = getStats().rankings[category];
  return [...new Set([...r.minutes, ...r.percent].map((t) => t.slug))].sort();
}

let lateBySlug: Map<string, number> | undefined;

/**
 * Share of measured trips that arrived 15+ min late, for a train or line page, from the search shards, so a page
 * and the search result for the same train show the same number. null when the unit is not in the index.
 */
export function getLatePct(slug: string): number | null {
  if (!lateBySlug) {
    lateBySlug = new Map();
    const dir = path.join(DATA_DIR, "search");
    for (const name of fs.readdirSync(dir)) {
      if (!/^s-.+\.json$/.test(name)) continue;
      const rows = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as unknown[][];
      for (const r of rows) {
        const rowSlug = r[12];
        if (typeof rowSlug === "string") lateBySlug.set(rowSlug, r[6] as number);
      }
    }
  }
  return lateBySlug.get(slug) ?? null;
}

export function getRoutes(): RoutesFile {
  return (routesCache ??= readJson<RoutesFile>("routes.json"));
}

export function getRoute(slug: string): RouteEntry {
  const r = getRoutes().routes.find((x) => x.slug === slug);
  if (!r) throw new Error(`no route "${slug}" in data/routes.json`);
  return r;
}

/** The route in the other direction, when it has a page too. */
export function getReverseRoute(r: RouteEntry): RouteEntry | null {
  return getRoutes().routes.find((x) => x.from === r.to && x.to === r.from) ?? null;
}
