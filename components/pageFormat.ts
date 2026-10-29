import type { Mode, TrainSummary } from "@/lib/types";
import { fmt1, fmtPct, monthShort } from "@/lib/format";

export const MODES: Record<Mode, { tab: string; explain: string; value: (t: TrainSummary) => string }> = {
  minutes: {
    tab: "Minutes late",
    explain: "Average minutes late at the last stop in Germany.",
    value: (t) => `${fmt1(t.minutes.avg)} min`,
  },
  percent: {
    tab: "% of trip",
    explain: "Delay compared to trip length. 15 min late on a 1 hour trip is +25%.",
    value: (t) => fmtPct(t.percent.avg),
  },
};

const TRAIN_KIND: Record<string, string> = {
  ICE: "ICE",
  IC: "Intercity",
  EC: "EuroCity",
  ECE: "EuroCity Express",
  RJ: "Railjet",
  RJX: "Railjet Express",
  NJ: "Night train",
  EN: "Night train",
  FLX: "Flixtrain",
  TGV: "TGV",
  WB: "WESTbahn",
};

/** "NJ" -> "Night train"; unknown codes stay as they are. */
export function trainKind(type: string): string {
  return TRAIN_KIND[type] ?? type;
}

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
