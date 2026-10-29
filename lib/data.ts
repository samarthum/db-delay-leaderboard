import fs from "node:fs";
import path from "node:path";
import type { Category, Monthly, Stats, StationsFile, UnitDetail } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CATEGORY_DIR: Record<Category, string> = { longDistance: "trains", regional: "lines" };

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), "utf8")) as T;
}

let statsCache: Stats | undefined;
let monthlyCache: Monthly | undefined;
let stationsCache: StationsFile | undefined;
const unitCache = new Map<string, UnitDetail>();

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
