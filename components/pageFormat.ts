import type { Category, Mode, UnitSummary } from "@/lib/types";
import { fmt1, fmtPct, orDash } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";

export { fmtDate, fmtDuration, fmtSigned1, fmtStat } from "@/lib/format";

export function modeCopy(lang: Lang, mode: Mode): { tab: string; explain: string; value: (t: UnitSummary) => string } {
  const t = makeT(lang);
  return mode === "minutes"
    ? { tab: t("mode.minutes.tab"), explain: t("mode.minutes.explain"), value: (u) => `${fmt1(u.minutes.avg, lang)} ${t("unit.min")}` }
    : { tab: t("mode.percent.tab"), explain: t("mode.percent.explain"), value: (u) => orDash(u.percent.avg, (v) => fmtPct(v, lang)) };
}

export const MODE_LIST: Mode[] = ["minutes", "percent"];

export function categoryCopy(lang: Lang, c: Category): { tab: string; plural: string; back: string; note: string } {
  const t = makeT(lang);
  return c === "longDistance"
    ? { tab: t("cat.longDistance.tab"), plural: t("cat.longDistance.plural"), back: t("cat.longDistance.back"), note: "" }
    : { tab: t("cat.regional.tab"), plural: t("cat.regional.plural"), back: t("cat.regional.back"), note: t("cat.regional.note") };
}

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

/** "ICE" -> "ICE", "IC" -> "Intercity", line "RE" -> "Regional-Express"; unknown codes stay as they are. The names are the same in both languages. */
export function unitKind(t: Pick<UnitSummary, "category" | "type">): string {
  return (t.category === "longDistance" ? TRAIN_KIND : LINE_KIND)[t.type] ?? t.type;
}

/** A train runs one way ("A → B"); a line runs both ways between its end stations ("A ↔ B"). */
export function routeArrow(lang: Lang, category: Category): { symbol: string; words: string } {
  const t = makeT(lang);
  return category === "longDistance" ? { symbol: "→", words: t("route.to") } : { symbol: "↔", words: t("route.and") };
}
