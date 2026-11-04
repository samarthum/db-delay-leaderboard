import type { Stats } from "./types";
import { getMonthly, getStations, getStats } from "./data";
import { fmt1, fmtInt, fmtShare1, monthLabel, spanLabel } from "./format";
import type { Lang } from "./i18n";
import { DATA_SOURCE_URL } from "./site";
import { makeT } from "./t";

/** One question of "How we measure": the answer as paragraphs (dictionary markup allowed) and optional bullets. */
export type MethodItem = { q: string; paras: string[]; bullets?: string[] };

/** Two ranked lines that share a name, if any: the clearest example of why a line is more than its number. */
function sameNameLines(stats: Stats) {
  const lines = [...stats.rankings.regional.minutes, ...stats.rankings.regional.percent];
  for (const a of lines) {
    const b = lines.find((x) => x.name === a.name && x.slug !== a.slug);
    if (b) return [a, b] as const;
  }
  return null;
}

/**
 * The questions and answers of the Method page. One source for what the page shows and for the FAQ structured data
 * and llms-full.txt, so they cannot drift apart.
 */
export function methodItems(lang: Lang): MethodItem[] {
  const t = makeT(lang);
  const stats = getStats();
  const { params: p, overall, window: w, recap } = stats;
  const ld = overall.longDistance;
  const reg = overall.regional;
  const series = getMonthly().series;
  const nudges = [...series.longDistance, ...series.regional].map((m) => m.avgDelayMin - m.avgDelayMinUnclamped);
  const nudgeLo = fmt1(Math.min(...nudges), lang);
  const nudgeHi = fmt1(Math.max(...nudges), lang);
  const merged = [...stats.rankings.longDistance.minutes, ...stats.rankings.longDistance.percent].find((u) => u.alsoRunsAs.length > 0);
  const twins = sameNameLines(stats);
  const stations = getStations().stations;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const early = p.clampMinMinutes < 0 ? t("method.early.neg", { n: -p.clampMinMinutes }) : t("method.early.pos", { n: p.clampMinMinutes });
  const rec = recap.longDistance;

  return [
    {
      q: t("method.q.source"),
      paras: [
        t("method.a.source", {
          url: DATA_SOURCE_URL,
          ld: p.longDistanceTypes.join(", "),
          reg: p.regionalLinePrefixes.join(", "),
          ldRuns: fmtInt(ld.runs, lang),
          regRuns: fmtInt(reg.runs, lang),
        }),
      ],
    },
    { q: t("method.q.headline"), paras: [t("method.a.headline", { span, late: fmtInt(rec.lateRuns, lang), measured: fmtInt(rec.measured, lang) })] },
    { q: t("method.q.rule"), paras: [t("method.a.rule")] },
    { q: t("method.q.search"), paras: [t("method.a.search", { min: p.searchMinRuns, few: p.searchFewRuns })] },
    {
      q: t("method.q.measured"),
      paras: [
        t("method.a.measured1"),
        t("method.a.measured2", { early, max: fmtInt(p.clampMaxMinutes, lang), dropped: fmtInt(ld.droppedByClamp + reg.droppedByClamp, lang), lo: nudgeLo, hi: nudgeHi }),
      ],
    },
    { q: t("method.q.pct"), paras: [t("method.a.pct", { min: p.minScheduledMinutesForPct })] },
    {
      q: t("method.q.listed"),
      paras: [
        t("method.a.listed1", { min: p.minRunsForPool, pool: fmtInt(ld.poolSize, lang), units: fmtInt(ld.units, lang) }),
        t("method.a.listed2", {
          minLine: fmtInt(p.minRunsForLinePool, lang),
          poolReg: fmtInt(reg.poolSize, lang),
          unitsReg: fmtInt(reg.units, lang),
          twins: twins ? t("method.a.twins", { a: twins[0].name, ao: twins[0].origin, ad: twins[0].dest, b: twins[1].name, bo: twins[1].origin, bd: twins[1].dest }) : "",
        }),
        t("method.a.listed3", { merged: merged ? t("method.a.merged", { name: merged.name, list: merged.alsoRunsAs.join(", ") }) : "" }),
      ],
    },
    { q: t("method.q.excluded"), paras: [t("method.a.excluded", { night: p.nightTrainTypes.join(", ") })] },
    { q: t("method.q.cancelled"), paras: [t("method.a.cancelled", { ld: fmtShare1(ld.fullCancelPct, lang), reg: fmtShare1(reg.fullCancelPct, lang) })] },
    {
      q: t("method.q.window", { n: w.monthCount }),
      paras: [t("method.a.window", { min: fmtInt(p.minStationsForFullMonth, lang), span })],
      bullets: w.skipped.length > 0 ? w.skipped.map((s) => t("method.a.skipped", { month: monthLabel(s.month, lang), n: fmtInt(s.stations, lang) })) : undefined,
    },
    {
      q: t("method.q.map"),
      paras: [t("method.a.map", { min: fmtInt(p.minStationArrivals, lang), n: fmtInt(stations.length, lang), span, big: fmtInt(p.bigStationMinArrivals, lang) })],
    },
    { q: t("method.q.cant"), paras: [t("method.a.cant")] },
  ];
}
