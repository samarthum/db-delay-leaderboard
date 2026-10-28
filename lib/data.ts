import fs from "node:fs";
import path from "node:path";
import type { Monthly, Stats, TrainDetail } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(...parts: string[]): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, ...parts), "utf8")) as T;
}

let statsCache: Stats | undefined;
let monthlyCache: Monthly | undefined;
const trainCache = new Map<string, TrainDetail>();

export function getStats(): Stats {
  return (statsCache ??= readJson<Stats>("stats.json"));
}

export function getMonthly(): Monthly {
  return (monthlyCache ??= readJson<Monthly>("monthly.json"));
}

export function getTrain(slug: string): TrainDetail {
  let t = trainCache.get(slug);
  if (!t) {
    t = readJson<TrainDetail>("trains", `${slug}.json`);
    trainCache.set(slug, t);
  }
  return t;
}

/** Slugs of every train with a detail page: the union of both stored rankings. */
export function getTrainSlugs(): string[] {
  const s = getStats();
  return [...new Set([...s.rankings.minutes, ...s.rankings.percent].map((t) => t.slug))].sort();
}

/** Top-N details for one ranking, in rank order. */
export function getTopDetails(mode: "minutes" | "percent", n: number): TrainDetail[] {
  return getStats()
    .rankings[mode].slice(0, n)
    .map((t) => getTrain(t.slug));
}
