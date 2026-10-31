"use client";

import { useEffect, useState } from "react";
import STATIONS from "../data/live-stations.json";
import { shortStation } from "./routeSlug";

/** One side of a change today, as /api/live/?at= sends it. Stamps are DB local time, yyMMddHHmm. */
export interface LiveSide {
  pt: string;
  ct: string | null;
  late: number | null;
  canc: boolean;
  plat: string | null;
  platChanged: boolean;
}
export interface LiveChange {
  a: LiveSide | null;
  b: LiveSide | null;
  /** Minutes between A's expected arrival and B's expected departure, as DB reports now. */
  spare: number | null;
  asOf: string;
}

// Ids the Timetables API answers without long-distance trains (scripts/live_trains.py keeps the same list).
const NO_LONG = new Set(["Düsseldorf Flughafen", "Köln Messe/Deutz", "Stendal Hbf", "Wolfsburg Hbf"]);
const LIVE = STATIONS as Record<string, unknown>;

/** The station's name for the live API, or null when it has no live data. */
export function liveStation(name: string): string | null {
  const s = shortStation(name);
  return LIVE[s] && !NO_LONG.has(s) ? s : null;
}

/** Minutes after midnight, Berlin time. */
export function berlinNow(): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

/** True when a planned arrival (minutes after midnight) is between an hour ago and four hours from now. */
export function isSoon(t: number, now = berlinNow()): boolean {
  const d = (t - now + 1440) % 1440;
  return d <= 240 || d >= 1440 - 60;
}

const REFRESH_MS = 60_000;

/** Today's change, refreshed once a minute while visible. null while loading, when off, or outside the window. */
export function useLiveChange(at: string | null, a: string | null, ta: number | null, b: string | null, tb: number | null): LiveChange | null {
  const [v, setV] = useState<LiveChange | null>(null);
  const key = at && a && ta !== null && isSoon(ta) ? new URLSearchParams({ at, a, ta: String(ta), ...(b && tb !== null ? { b, tb: String(tb) } : {}) }).toString() : null;
  useEffect(() => {
    setV(null);
    if (!key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const r = await fetch(`/api/live/?${key}`);
        const j = await r.json();
        if (alive && j && j.ok) setV(j.run ?? null);
      } catch {
        /* offline or no function on this host */
      }
      clearTimeout(timer);
      if (alive && document.visibilityState === "visible") timer = setTimeout(load, REFRESH_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void load();
      }
    };
    void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);
  return v;
}

/** Upper bounds of the delay bins in connection-pairs.json (scripts/connections.py LATE_BINS); the last bin is "more". */
export const LATE_BINS = [5, 10, 15, 20, 30, 60];
/** Fewer days than this in the bins around today's delay and no "days like today" figure is shown. */
export const LIKE_MIN_DAYS = 8;

/**
 * Days like today for one pair: the bin of today's delay, widened to its neighbours until it has LIKE_MIN_DAYS days.
 * bins = flat [days, ok@2, ok@6] per bin. Returns the merged range (lo/hi minutes; hi null = open) and counts, or null.
 */
export function daysLike(bins: number[] | undefined, late: number, slow: boolean): { lo: number; hi: number | null; n: number; ok: number } | null {
  if (!bins || bins.length !== 3 * (LATE_BINS.length + 1)) return null;
  const nb = LATE_BINS.length + 1;
  let i = LATE_BINS.findIndex((u) => late <= u);
  if (i < 0) i = nb - 1;
  let lo = i;
  let hi = i;
  const sum = (k: number) => {
    let s = 0;
    for (let j = lo; j <= hi; j++) s += bins[3 * j + k];
    return s;
  };
  // Widen one bin at a time, nearer side first, at most three bins in all so "like today" stays honest.
  while (sum(0) < LIKE_MIN_DAYS && hi - lo < 2) {
    const up = hi + 1 < nb ? bins[3 * (hi + 1)] : -1;
    const down = lo - 1 >= 0 ? bins[3 * (lo - 1)] : -1;
    if (up < 0 && down < 0) break;
    if (up >= down) hi++;
    else lo--;
  }
  const n = sum(0);
  if (n < LIKE_MIN_DAYS) return null;
  return { lo: lo === 0 ? 0 : LATE_BINS[lo - 1] + 1, hi: hi === nb - 1 ? null : LATE_BINS[hi], n, ok: sum(slow ? 2 : 1) };
}
