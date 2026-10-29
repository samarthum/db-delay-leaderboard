import type { Category, Mode, UnitSummary } from "@/lib/types";
import { fmt1, fmtPct, monthShort } from "@/lib/format";

export const MODES: Record<Mode, { tab: string; explain: string; value: (t: UnitSummary) => string }> = {
  minutes: {
    tab: "Minutes late",
    explain: "Average minutes late at the last stop.",
    value: (t) => `${fmt1(t.minutes.avg)} min`,
  },
  percent: {
    tab: "% of trip",
    explain: "Delay compared to trip length. 15 min late on a 1 hour trip is +25%.",
    value: (t) => fmtPct(t.percent.avg),
  },
};

export const CATEGORY_COPY: Record<Category, { tab: string; plural: string; back: string; note: string }> = {
  longDistance: { tab: "Long-distance", plural: "long-distance trains", back: "All trains", note: "" },
  regional: {
    tab: "Regional",
    plural: "regional lines",
    back: "All lines",
    note: " A line counts its trips in both directions.",
  },
};

const TRAIN_KIND: Record<string, string> = {
  ICE: "ICE",
  IC: "Intercity",
  EC: "EuroCity",
  ECE: "EuroCity Express",
  RJ: "Railjet",
  RJX: "Railjet Express",
  FLX: "Flixtrain",
  TGV: "TGV",
  WB: "WESTbahn",
};

const LINE_KIND: Record<string, string> = {
  RE: "Regional-Express",
  RB: "Regionalbahn",
  IRE: "Interregio-Express",
  MEX: "Metropolexpress",
  RS: "Regio-S-Bahn",
  FEX: "Flughafen-Express",
};

/** "ICE" -> "ICE", "IC" -> "Intercity", line "RE" -> "Regional-Express"; unknown codes stay as they are. */
export function unitKind(t: Pick<UnitSummary, "category" | "type">): string {
  return (t.category === "longDistance" ? TRAIN_KIND : LINE_KIND)[t.type] ?? t.type;
}

/** A train runs one way ("A → B"); a line runs both ways between its end stations ("A ↔ B"). */
export function routeArrow(category: Category): { symbol: string; words: string } {
  return category === "longDistance" ? { symbol: "→", words: "to" } : { symbol: "↔", words: "and" };
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
