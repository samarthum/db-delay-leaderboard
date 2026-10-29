import type { Metadata } from "next";
import Link from "next/link";
import type { HistBin, Mode, TrainDetail } from "@/lib/types";
import { getMonthly, getStats, getTrain, getTrainSlugs } from "@/lib/data";
import { fmt1, fmtInt, fmtMin, fmtPct, monthLabel } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { trainMetadata } from "@/lib/seo";
import { TopBar } from "@/components/TopBar";
import { Footer } from "@/components/Footer";
import { SplitFlap } from "@/components/SplitFlap";
import { Histogram } from "@/components/Histogram";
import { TrainMonthChart } from "@/components/TrainMonthChart";
import { RouteStrip } from "@/components/RouteStrip";
import { ShareButton } from "@/components/ShareButton";
import { fmtDate, fmtDuration, fmtSigned1, fmtStat, trainKind } from "@/components/pageFormat";
import styles from "./train.module.css";

type Params = { slug: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getTrainSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return trainMetadata(getTrain(slug));
}

function shareOf(bins: HistBin[], from: number): number {
  return bins.filter((b) => b.lo !== null && b.lo >= from).reduce((s, b) => s + b.share, 0);
}

function histogramHeadline(bins: HistBin[]): string {
  const hour = shareOf(bins, 60);
  if (hour >= 10) return `${fmt1(hour)}% of trips were an hour or more late`;
  const late = shareOf(bins, 15);
  return `${fmt1(late)}% of trips were 15 minutes or more late`;
}

function onTimeShare(bins: HistBin[]): number {
  return bins.filter((b) => b.hi !== null && b.hi <= 5).reduce((s, b) => s + b.share, 0);
}

function biggestJump(t: TrainDetail) {
  let best: { from: string; to: string; delta: number } | null = null;
  for (let i = 1; i < t.stops.length; i++) {
    const delta = t.stops[i].avgDelay - t.stops[i - 1].avgDelay;
    if (delta > 0 && (!best || delta > best.delta)) {
      best = { from: t.stops[i - 1].name, to: t.stops[i].name, delta };
    }
  }
  return best;
}

function shareText(t: TrainDetail): string {
  const rank =
    t.rank.minutes === 1
      ? "The most delayed long-distance train in Germany."
      : t.rank.minutes !== null
        ? `No. ${t.rank.minutes} of Germany's most delayed long-distance trains.`
        : `No. ${t.rank.percent} for delay compared to trip length.`;
  return `${t.train} from ${t.origin} to ${t.dest} is ${fmtMin(t.minutes.avg)} min late on average. ${rank}`;
}

export default async function TrainPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const t = getTrain(slug);
  const stats = getStats();
  const monthly = getMonthly();
  const url = absoluteUrl(`/train/${slug}/`);

  const navMode: Mode = t.rank.minutes !== null ? "minutes" : "percent";
  const navList = stats.rankings[navMode];
  const navIndex = navList.findIndex((x) => x.slug === slug);
  const prev = navIndex > 0 ? navList[navIndex - 1] : null;
  const next = navIndex >= 0 && navIndex < navList.length - 1 ? navList[navIndex + 1] : null;
  const navUnit = navMode === "minutes" ? "by minutes" : "by % of trip";

  const measuredMonths = t.monthly.filter((m) => m.avg !== null);
  const worstMonth = measuredMonths.reduce<(typeof measuredMonths)[number] | null>(
    (a, b) => (a === null || (b.avg ?? 0) > (a.avg ?? 0) ? b : a),
    null,
  );
  const jump = biggestJump(t);
  const onTime = onTimeShare(t.histogram);

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Minutes late",
      rows: [
        ["Average", `${fmtSigned1(t.minutes.avg)} min`],
        ["Median (half were later)", `${fmtStat(t.minutes.median)} min`],
        ["P90 (1 in 10 were later)", `${fmtStat(t.minutes.p90)} min`],
        ["Std dev (how much it varies)", `${fmt1(t.minutes.sd)} min`],
      ],
    },
    {
      title: "% of trip",
      rows: [
        ["Average", fmtPct(t.percent.avg)],
        ["Median", `${fmtStat(t.percent.median)}%`],
        ["P90", `${fmtStat(t.percent.p90)}%`],
        ["Std dev", `${fmt1(t.percent.sd)} pts`],
      ],
    },
    {
      title: "Trips",
      rows: [
        ["Trips in the data", fmtInt(t.runs)],
        ["Trips measured", fmtInt(t.measured)],
        ["Trips counted for %", fmtInt(t.measuredPct)],
        ["Planned trip time", fmtDuration(t.avgScheduledMin)],
        ["Cancelled", `${fmt1(t.fullCancelPct)}%`],
        ["Partly cancelled", `${fmt1(t.partialCancelPct)}%`],
      ],
    },
  ];

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <div className="container">
          <Link href="/#leaderboard" className={styles.back}>
            <span aria-hidden="true">←</span> All trains
          </Link>

          <header className={`board ${styles.board}`}>
            <p className={styles.kicker}>
              <span className={styles.typeChip}>{trainKind(t.type)}</span>
              {t.rank.minutes !== null ? <span className={styles.rankChip}>No. {t.rank.minutes} by minutes</span> : null}
              {t.rank.percent !== null ? <span className={styles.rankChip}>No. {t.rank.percent} by % of trip</span> : null}
            </p>
            <h1 className={styles.title}>
              <SplitFlap text={t.train} size="lg" />
            </h1>
            <p className={styles.route}>
              {t.origin} <span aria-hidden="true">→</span>
              <span className="visually-hidden"> to </span> {t.dest}
            </p>
            {t.alsoRunsAs.length > 0 ? (
              <p className={styles.routeNote}>Also runs as {t.alsoRunsAs.join(", ")}.</p>
            ) : null}

            <div className={styles.figure}>
              <SplitFlap text={fmtMin(t.minutes.avg)} size="xl" tone="accent" label={`${fmt1(t.minutes.avg)} minutes`} />
              <p className={styles.figureLabel}>
                <span className={styles.figureUnit}>min</span>
                <span>late on average</span>
              </p>
            </div>
            <p className={styles.exact}>
              That is {fmtPct(t.percent.avg)} of the trip time ({fmtDuration(t.avgScheduledMin)}). Based on{" "}
              {fmtInt(t.measured)} trips.
            </p>
          </header>

          <div className={styles.shareRow}>
            <ShareButton title={`${t.train} · German Punctuality`} text={shareText(t)} url={url} />
          </div>

          {t.worstRun ? (
            <section className={`${styles.section} ${styles.worst}`} aria-labelledby="worst-run">
              <p className={styles.worstLabel}>Worst trip</p>
              <h2 id="worst-run" className={styles.worstFigure}>
                {fmtDuration(t.worstRun.delayMin)} late
              </h2>
              <p className={styles.worstText}>
                On {fmtDate(t.worstRun.date)}, {t.worstRun.origin} → {t.worstRun.dest}.
              </p>
            </section>
          ) : null}

          <section className={styles.section} aria-labelledby="distribution">
            <h2 id="distribution" className={styles.h2}>
              {histogramHeadline(t.histogram)}
            </h2>
            <p className={styles.sub}>{fmt1(onTime)}% were within 5 minutes of the timetable.</p>
            <div className={styles.card}>
              <Histogram bins={t.histogram} />
            </div>
          </section>

          {t.stops.length > 0 ? (
            <section className={styles.section} aria-labelledby="route">
              <h2 id="route" className={styles.h2}>
                {jump
                  ? `The delay grows most between ${jump.from} and ${jump.to} (+${fmt1(jump.delta)} min)`
                  : "Delay along the route"}
              </h2>
              <p className={styles.sub}>Average minutes late at each stop.</p>
              <div className={styles.card}>
                <RouteStrip stops={t.stops} />
              </div>
            </section>
          ) : null}

          <section className={styles.section} aria-labelledby="by-month">
            <h2 id="by-month" className={styles.h2}>
              {worstMonth && worstMonth.avg !== null
                ? `Its worst month was ${monthLabel(worstMonth.month)}, at ${fmt1(worstMonth.avg)} min late on average`
                : "Month by month"}
            </h2>
            <p className={styles.sub}>The dashed line is all long-distance trains.</p>
            <div className={styles.card}>
              <TrainMonthChart
                monthly={t.monthly}
                networkAvg={monthly.months.map((m) => ({ month: m.month, avg: m.avgDelayMin }))}
              />
            </div>
          </section>

          <details className={styles.numbers}>
            <summary className={styles.numbersSummary}>All the numbers</summary>
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
              {t.routeVariants === 1
                ? "It ran the same route every time."
                : `It ran ${t.routeVariants} different routes. This page shows the most common one.`}{" "}
              {t.stops.length > 0 ? `The stops come from ${fmtInt(t.stopsSequenceRuns)} of ${fmtInt(t.runs)} trips. ` : ""}
              For trains that leave Germany, delay is measured at the last stop in Germany.
            </p>
          </details>

          {prev || next ? (
            <nav className={styles.pager} aria-label={`Neighbours in the ranking ${navUnit}`}>
              {prev ? (
                <Link href={`/train/${prev.slug}/`} className={styles.pagerLink}>
                  <span className={styles.pagerHint}>← No. {navIndex} {navUnit}</span>
                  <span className={styles.pagerName}>{prev.train}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/train/${next.slug}/`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
                  <span className={styles.pagerHint}>
                    No. {navIndex + 2} {navUnit} →
                  </span>
                  <span className={styles.pagerName}>{next.train}</span>
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </main>
      <Footer generatedAt={stats.generatedAt} />
    </>
  );
}
