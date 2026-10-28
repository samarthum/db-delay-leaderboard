import type { Mode } from "@/lib/types";
import { fmt1, monthShort } from "@/lib/format";

export const MODE_LABEL: Record<Mode, string> = {
  minutes: "By minutes",
  percent: "By % of journey",
};

/** -1.6 -> "−1.6", 4.2 -> "4.2" (typographic minus so it lines up with tabular figures) */
export function fmtSigned1(n: number): string {
  return n < 0 ? `−${fmt1(Math.abs(n))}` : fmt1(n);
}

/** Whole numbers stay whole (50 -> "50"), others get one decimal (144.3), negatives a typographic minus. */
export function fmtStat(n: number): string {
  return Number.isInteger(n) ? String(n).replace("-", "−") : fmtSigned1(n);
}

/** 488.7 -> "8 h 9 min", 42 -> "42 min" */
export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** "2026-06-27" -> "27 Jun 2026" without touching the runtime time zone */
export function fmtDate(iso: string): string {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${monthShort(`${y}-${mo}`)} ${y}`;
}

/** 1 -> "01" so ranks line up on the board */
export function fmtRank(n: number): string {
  return String(n).padStart(2, "0");
}
