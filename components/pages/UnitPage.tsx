import Link from "next/link";
import type { Category, HistBin, Mode, UnitDetail } from "@/lib/types";
import { getLatePct, getMonthly, getStats, getUnit } from "@/lib/data";
import { fmt1, fmtDate, fmtDuration, fmtInt, fmtPct, fmtSigned1, fmtStat, fmtShare1, monthLabel, spanLabel } from "@/lib/format";
import { absoluteUrl, unitHref } from "@/lib/site";
import { rankSentence } from "@/lib/seo";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { LateLead } from "../LateLead";
import { Histogram } from "../Histogram";
import { TrainMonthChart } from "../TrainMonthChart";
import { RouteStrip } from "../RouteStrip";
import { RouteText } from "../RouteText";
import { ShareButton } from "../ShareButton";
import { categoryCopy, unitKind } from "../pageFormat";
import styles from "./UnitPage.module.css";

function shareOf(bins: HistBin[], from: number): number {
  return bins.filter((b) => b.lo !== null && b.lo >= from).reduce((s, b) => s + b.share, 0);
}

function onTimeShare(bins: HistBin[]): number {
  return bins.filter((b) => b.hi !== null && b.hi <= 5).reduce((s, b) => s + b.share, 0);
}

function biggestJump(t: UnitDetail) {
  let best: { from: string; to: string; delta: number } | null = null;
  for (let i = 1; i < t.stops.length; i++) {
    const delta = t.stops[i].avgDelay - t.stops[i - 1].avgDelay;
    if (delta > 0 && (!best || delta > best.delta)) {
      best = { from: t.stops[i - 1].name, to: t.stops[i].name, delta };
    }
  }
  return best;
}

export function UnitPage({ category, slug, lang }: { category: Category; slug: string; lang: Lang }) {
  const tr = makeT(lang);
  const t = getUnit(category, slug);
  const stats = getStats();
  const monthly = getMonthly();
  const url = absoluteUrl(unitHref(t, lang));
  const copy = categoryCopy(lang, category);
  const isLine = category === "regional";
  const w = stats.window;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);

  // Same number as the search result for this unit; the histogram is the fallback.
  const latePct = getLatePct(slug) ?? shareOf(t.histogram, 15);

  const navMode: Mode = t.rank.minutes !== null ? "minutes" : "percent";
  const navList = stats.rankings[category][navMode];
  const navIndex = navList.findIndex((x) => x.slug === slug);
  const prev = navIndex > 0 ? navList[navIndex - 1] : null;
  const next = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;
  const navUnit = navMode === "minutes" ? tr("unit.pager.byMinutes") : tr("unit.pager.byPercent");

  const measuredMonths = t.monthly.filter((m) => m.avg !== null);
  const worstMonth = measuredMonths.reduce<(typeof measuredMonths)[number] | null>(
    (a, b) => (a === null || (b.avg ?? 0) > (a.avg ?? 0) ? b : a),
    null,
  );
  const jump = biggestJump(t);
  const onTime = onTimeShare(t.histogram);
  const first = t.stops[0];
  const last = t.stops[t.stops.length - 1];
  const min = tr("unit.min");

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: tr("unit.g.minutes"),
      rows: [
        [tr("unit.r.avg"), `${fmtSigned1(t.minutes.avg, lang)} ${min}`],
        [tr("unit.r.median"), `${fmtStat(t.minutes.median, lang)} ${min}`],
        [tr("unit.r.p90"), `${fmtStat(t.minutes.p90, lang)} ${min}`],
        [tr("unit.r.sd"), `${fmt1(t.minutes.sd, lang)} ${min}`],
      ],
    },
    {
      title: tr("unit.g.percent"),
      rows: [
        [tr("unit.r.avg"), fmtPct(t.percent.avg, lang)],
        [tr("unit.r.medianShort"), `${fmtStat(t.percent.median, lang)}${lang === "de" ? "\u00a0%" : "%"}`],
        [tr("unit.r.p90Short"), `${fmtStat(t.percent.p90, lang)}${lang === "de" ? "\u00a0%" : "%"}`],
        [tr("unit.r.sdShort"), tr("unit.r.pts", { x: fmt1(t.percent.sd, lang) })],
      ],
    },
    {
      title: tr("unit.g.trips"),
      rows: [
        [tr("unit.r.runs"), fmtInt(t.runs, lang)],
        [tr("unit.r.measured"), fmtInt(t.measured, lang)],
        [tr("unit.r.measuredPct"), fmtInt(t.measuredPct, lang)],
        [tr("unit.r.planned"), fmtDuration(t.avgScheduledMin)],
        [tr("unit.r.canc"), fmtShare1(t.fullCancelPct, lang)],
        [tr("unit.r.partial"), fmtShare1(t.partialCancelPct, lang)],
      ],
    },
  ];

  const routesNote = isLine
    ? tr("unit.routes.line", { n: fmtInt(t.routeVariants, lang) })
    : t.routeVariants === 1
      ? tr("unit.routes.one")
      : tr("unit.routes.many", { n: t.routeVariants });

  const where = tr(isLine ? "unit.where.line" : "unit.where.train", { o: t.origin, d: t.dest });
  const shareText = tr("unit.shareText", {
    name: t.name,
    where,
    pct: fmtShare1(latePct, lang),
    avg: fmt1(t.minutes.avg, lang),
    rank: rankSentence(t, lang),
  }).trim();

  const hourShare = shareOf(t.histogram, 60);
  const histHeadline = hourShare >= 10 ? tr("unit.hist.hour", { pct: fmtShare1(hourShare, lang) }) : tr("unit.hist.late", { pct: fmtShare1(shareOf(t.histogram, 15), lang) });

  return (
    <main id="main" className={styles.page}>
      <div className="container">
        <Link href={route(lang, "ranking")} className={styles.back} prefetch={false}>
          <span aria-hidden="true">←</span> {tr("unit.back")}
        </Link>

        <header className={`board ${styles.board}`}>
          <p className={styles.kicker}>
            <span className={styles.typeChip}>{unitKind(t)}</span>
            {t.rank.minutes !== null ? <span className={styles.rankChip}>{tr("unit.rankMinutes", { n: t.rank.minutes })}</span> : null}
            {t.rank.percent !== null ? <span className={styles.rankChip}>{tr("unit.rankPercent", { n: t.rank.percent })}</span> : null}
          </p>
          <h1 className={styles.title}>{t.name}</h1>
          <p className={styles.route}>
            <RouteText unit={t} lang={lang} />
          </p>
          {t.alsoRunsAs.length > 0 ? <p className={styles.routeNote}>{tr("unit.alsoRunsAs", { list: t.alsoRunsAs.join(", ") })}</p> : null}

          <div className={styles.lead}>
            <LateLead pct={latePct} measured={t.measured} lang={lang} basis={tr("res.basis", { span })} />
          </div>

          <dl className={styles.tiles}>
            <div className={styles.tile}>
              <dt>{tr("unit.avgTile")}</dt>
              <dd>{fmt1(t.minutes.avg, lang)}</dd>
              <dd className={styles.tileNote}>{min}</dd>
            </div>
            <div className={styles.tile}>
              <dt>{tr("unit.relTile")}</dt>
              <dd>{fmtPct(t.percent.avg, lang)}</dd>
              <dd className={styles.tileNote}>{tr("unit.relTileNote", { dur: fmtDuration(t.avgScheduledMin) })}</dd>
            </div>
            <div className={styles.tile}>
              <dt>{tr("unit.cancTile")}</dt>
              <dd>{fmtShare1(t.fullCancelPct, lang)}</dd>
              <dd className={styles.tileNote}>{tr("unit.cancNote", { n: fmtInt(t.runs, lang) })}</dd>
            </div>
          </dl>
        </header>

        <div className={styles.shareRow}>
          <ShareButton lang={lang} title={`${t.name} · German Punctuality`} text={shareText} url={url} label={tr(isLine ? "unit.shareLine" : "unit.shareTrain")} />
        </div>

        {t.worstRun ? (
          <section className={`${styles.section} ${styles.worst}`} aria-labelledby="worst-run">
            <p className={styles.worstLabel}>{tr("unit.worst")}</p>
            <h2 id="worst-run" className={styles.worstFigure}>
              {tr("unit.worstFigure", { dur: fmtDuration(t.worstRun.delayMin) })}
            </h2>
            <p className={styles.worstText}>{tr("unit.worstText", { date: fmtDate(t.worstRun.date, lang), o: t.worstRun.origin, d: t.worstRun.dest })}</p>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="distribution">
          <h2 id="distribution" className={styles.h2}>
            {histHeadline}
          </h2>
          <p className={styles.sub}>{tr("unit.hist.onTime", { pct: fmtShare1(onTime, lang) })}</p>
          <div className={styles.card}>
            <Histogram bins={t.histogram} lang={lang} />
          </div>
        </section>

        {t.stops.length > 0 ? (
          <section className={styles.section} aria-labelledby="route">
            <h2 id="route" className={styles.h2}>
              {jump ? tr("unit.route.jump", { from: jump.from, to: jump.to, delta: fmt1(jump.delta, lang) }) : tr("unit.route.default")}
            </h2>
            <p className={styles.sub}>{tr("unit.route.sub", { extra: isLine ? tr("unit.route.extra", { a: first.name, b: last.name }) : "" })}</p>
            <div className={styles.card}>
              <RouteStrip stops={t.stops} lang={lang} />
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="by-month">
          <h2 id="by-month" className={styles.h2}>
            {worstMonth && worstMonth.avg !== null
              ? tr("unit.month.worst", { month: monthLabel(worstMonth.month, lang), avg: fmt1(worstMonth.avg, lang) })
              : tr("unit.month.default")}
          </h2>
          <p className={styles.sub}>{tr("unit.month.sub", { plural: copy.plural })}</p>
          <div className={styles.card}>
            <TrainMonthChart
              lang={lang}
              monthly={t.monthly}
              networkAvg={monthly.series[category].map((m) => ({ month: m.month, avg: m.avgDelayMin }))}
              networkLabel={tr("unit.month.net", { plural: copy.plural })}
            />
          </div>
        </section>

        <details className={styles.numbers}>
          <summary className={styles.numbersSummary}>{tr("unit.numbers")}</summary>
          <div className={styles.groups}>
            {groups.map((g) => (
              <div key={g.title} className={styles.group}>
                <h3 className={styles.groupTitle}>{g.title}</h3>
                <dl className={styles.dl}>
                  {g.rows.map(([k, v]) => (
                    <div key={k} className={styles.row}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className={styles.sub}>
            {routesNote} {t.stops.length > 0 ? `${tr("unit.stopsFrom", { n: fmtInt(t.stopsSequenceRuns, lang), runs: fmtInt(t.runs, lang) })} ` : ""}
            {isLine ? "" : tr("unit.abroad")}
          </p>
        </details>

        {prev || next ? (
          <nav className={styles.pager} aria-label={tr("unit.pager.aria", { unit: navUnit })}>
            {prev ? (
              <Link href={unitHref(prev, lang)} className={styles.pagerLink} prefetch={false}>
                <span className={styles.pagerHint}>{tr("unit.pager.prev", { n: navIndex, unit: navUnit })}</span>
                <span className={styles.pagerName}>{prev.name}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={unitHref(next, lang)} className={`${styles.pagerLink} ${styles.pagerNext}`} prefetch={false}>
                <span className={styles.pagerHint}>{tr("unit.pager.next", { n: navIndex + 2, unit: navUnit })}</span>
                <span className={styles.pagerName}>{next.name}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
