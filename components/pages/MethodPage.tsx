import type { Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtShare1, spanLabel, monthLabel } from "@/lib/format";
import { getMonthly, getStations, getStats } from "@/lib/data";
import { DATA_SOURCE_URL } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Credits } from "../Credits";
import { Rich } from "../Rich";
import styles from "./Method.module.css";

function Item({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className={styles.item}>
      <summary className={styles.summary}>
        <span>{q}</span>
        <span className={styles.icon} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/** Two ranked lines that share a name, if any: the clearest example of why a line is more than its number. */
function sameNameLines(stats: Stats) {
  const lines = [...stats.rankings.regional.minutes, ...stats.rankings.regional.percent];
  for (const a of lines) {
    const b = lines.find((x) => x.name === a.name && x.slug !== a.slug);
    if (b) return [a, b] as const;
  }
  return null;
}

export function MethodPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const { params: p, overall, window: w, headline, recap } = stats;
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

  return (
    <main id="main" className="container page">
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("method.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {t("method.sub")}
      </p>

      <div className={styles.list}>
        <Item q={t("method.q.source")}>
          <p>
            <Rich
              text={t("method.a.source", {
                url: DATA_SOURCE_URL,
                ld: p.longDistanceTypes.join(", "),
                reg: p.regionalLinePrefixes.join(", "),
                ldRuns: fmtInt(ld.runs, lang),
                regRuns: fmtInt(reg.runs, lang),
              })}
            />
          </p>
        </Item>

        <Item q={t("method.q.headline")}>
          <p>
            {t("method.a.headline", {
              span,
              late: fmtInt(rec.lateRuns, lang),
              measured: fmtInt(rec.measured, lang),
            })}
          </p>
        </Item>

        <Item q={t("method.q.rule")}>
          <p>{t("method.a.rule")}</p>
        </Item>

        <Item q={t("method.q.search")}>
          <p>{t("method.a.search", { min: p.searchMinRuns, few: p.searchFewRuns })}</p>
        </Item>

        <Item q={t("method.q.measured")}>
          <p>{t("method.a.measured1")}</p>
          <p>
            {t("method.a.measured2", {
              early,
              max: fmtInt(p.clampMaxMinutes, lang),
              dropped: fmtInt(ld.droppedByClamp + reg.droppedByClamp, lang),
              lo: nudgeLo,
              hi: nudgeHi,
            })}
          </p>
        </Item>

        <Item q={t("method.q.pct")}>
          <p>{t("method.a.pct", { min: p.minScheduledMinutesForPct })}</p>
        </Item>

        <Item q={t("method.q.listed")}>
          <p>{t("method.a.listed1", { min: p.minRunsForPool, pool: fmtInt(ld.poolSize, lang), units: fmtInt(ld.units, lang) })}</p>
          <p>
            {t("method.a.listed2", {
              minLine: fmtInt(p.minRunsForLinePool, lang),
              poolReg: fmtInt(reg.poolSize, lang),
              unitsReg: fmtInt(reg.units, lang),
              twins: twins
                ? t("method.a.twins", {
                    a: twins[0].name,
                    ao: twins[0].origin,
                    ad: twins[0].dest,
                    b: twins[1].name,
                    bo: twins[1].origin,
                    bd: twins[1].dest,
                  })
                : "",
            })}
          </p>
          <p>
            {t("method.a.listed3", {
              merged: merged ? t("method.a.merged", { name: merged.name, list: merged.alsoRunsAs.join(", ") }) : "",
            })}
          </p>
        </Item>

        <Item q={t("method.q.excluded")}>
          <p>{t("method.a.excluded", { night: p.nightTrainTypes.join(", ") })}</p>
        </Item>

        <Item q={t("method.q.cancelled")}>
          <p>{t("method.a.cancelled", { ld: fmtShare1(ld.fullCancelPct, lang), reg: fmtShare1(reg.fullCancelPct, lang) })}</p>
        </Item>

        <Item q={t("method.q.window", { n: w.monthCount })}>
          <p>{t("method.a.window", { min: fmtInt(p.minStationsForFullMonth, lang), span })}</p>
          {w.skipped.length > 0 ? (
            <ul className={styles.bullets}>
              {w.skipped.map((s) => (
                <li key={s.month}>{t("method.a.skipped", { month: monthLabel(s.month, lang), n: fmtInt(s.stations, lang) })}</li>
              ))}
            </ul>
          ) : null}
        </Item>

        <Item q={t("method.q.map")}>
          <p>
            {t("method.a.map", {
              min: fmtInt(p.minStationArrivals, lang),
              n: fmtInt(stations.length, lang),
              span,
              big: fmtInt(p.bigStationMinArrivals, lang),
            })}
          </p>
        </Item>

        <Item q={t("method.q.cant")}>
          <p>{t("method.a.cant")}</p>
        </Item>
      </div>

      <Credits lang={lang} generatedAt={stats.generatedAt} />
    </main>
  );
}
