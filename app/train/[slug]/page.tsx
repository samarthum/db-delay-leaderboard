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
import { fmtDate, fmtDuration, fmtSigned1, fmtStat } from "@/components/pageFormat";
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
  if (hour >= 10) return `${fmt1(hour)}% of measured runs arrived an hour or more late.`;
  const late = shareOf(bins, 15);
  return `${fmt1(late)}% of measured runs arrived 15 minutes or more late.`;
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
  const lead =
    t.rank.minutes === 1
      ? "Deutsche Bahn's most delayed train."
      : t.rank.percent === 1
        ? "Deutsche Bahn's most delayed train relative to journey time."
        : t.rank.minutes !== null
          ? `#${t.rank.minutes} on the DB Delay Leaderboard.`
          : `#${t.rank.percent} on the DB Delay Leaderboard (by % of the journey).`;
  return `${t.train} runs ${fmtMin(t.minutes.avg)} min late on average (${fmtPct(t.percent.avg)} of the journey). ${lead} Your connection is not guaranteed.`;
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
  const navUnit = navMode === "minutes" ? "by minutes" : "by %";

  const measuredMonths = t.monthly.filter((m) => m.avg !== null);
  const worstMonth = measuredMonths.reduce<(typeof measuredMonths)[number] | null>(
    (a, b) => (a === null || (b.avg ?? 0) > (a.avg ?? 0) ? b : a),
    null,
  );
  const networkWorst = worstMonth ? monthly.months.find((m) => m.month === worstMonth.month) : undefined;
  const jump = biggestJump(t);
  const onTime = onTimeShare(t.histogram);

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Minutes late",
      rows: [
        ["Average", `${fmtSigned1(t.minutes.avg)} min`],
        ["Median", `${fmtStat(t.minutes.median)} min`],
        ["P90 (1 in 10 runs is worse)", `${fmtStat(t.minutes.p90)} min`],
        ["Std dev", `${fmt1(t.minutes.sd)} min`],
      ],
    },
    {
      title: "% of the journey",
      rows: [
        ["Average", fmtPct(t.percent.avg)],
        ["Median", `${fmtStat(t.percent.median)}%`],
        ["P90", `${fmtStat(t.percent.p90)}%`],
        ["Std dev", `${fmt1(t.percent.sd)} pts`],
      ],
    },
    {
      title: "Runs",
      rows: [
        ["Runs in the window", fmtInt(t.runs)],
        ["Measured runs", fmtInt(t.measured)],
        ["Counted for %", fmtInt(t.measuredPct)],
        ["Avg scheduled journey", fmtDuration(t.avgScheduledMin)],
        ["Fully cancelled", `${fmt1(t.fullCancelPct)}%`],
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
              <span className={styles.typeChip}>{t.type}</span>
              {t.rank.minutes !== null ? <span className={styles.rankChip}>#{t.rank.minutes} by minutes</span> : null}
              {t.rank.percent !== null ? <span className={styles.rankChip}>#{t.rank.percent} by %</span> : null}
            </p>
            <h1 className={styles.title}>
              <SplitFlap text={t.train} size="lg" />
            </h1>
            <p className={styles.route}>
              {t.origin} <span aria-hidden="true">→</span>
              <span className="visually-hidden"> to </span> {t.dest}
            </p>
            <p className={styles.routeNote}>
              {t.routeVariants === 1
                ? "Same route on every run."
                : `The most common of ${t.routeVariants} route variants.`}{" "}
              Delay is measured at the last German stop for international trains.
            </p>

            <div className={styles.figures}>
              <div className={styles.figure}>
                <SplitFlap text={fmtMin(t.minutes.avg)} size="xl" tone="amber" label={`${fmt1(t.minutes.avg)} minutes`} />
                <p className={styles.figureLabel}>
                  <span className={styles.figureUnit}>min</span>
                  <span className={styles.chip}>late on average</span>
                </p>
              </div>
              <div className={styles.figure}>
                <SplitFlap text={fmtPct(t.percent.avg)} size="xl" />
                <p className={styles.figureLabel}>
                  <span className={styles.chip}>of the scheduled journey</span>
                </p>
              </div>
            </div>
            <p className={styles.exact}>
              {fmt1(t.minutes.avg)} min on an average scheduled journey of {fmtDuration(t.avgScheduledMin)},
              over {fmtInt(t.measured)} measured runs.
            </p>
          </header>

          <div className={styles.shareRow}>
            <ShareButton title={`${t.train} · DB Delay Leaderboard`} text={shareText(t)} url={url} />
          </div>

          <section className={styles.section} aria-labelledby="numbers">
            <p className="eyebrow">All the stats</p>
            <h2 id="numbers" className={styles.h2}>
              The numbers
            </h2>
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
          </section>

          <section className={styles.section} aria-labelledby="distribution">
            <p className="eyebrow">Delay distribution</p>
            <h2 id="distribution" className={styles.h2}>
              {histogramHeadline(t.histogram)}
            </h2>
            <p className={styles.sub}>
              {onTime < 50 ? "Only " : ""}
              {fmt1(onTime)}% arrived within 5 minutes of schedule.
            </p>
            <div className={styles.card}>
              <Histogram bins={t.histogram} />
            </div>
          </section>

          <section className={styles.section} aria-labelledby="by-month">
            <p className="eyebrow">Month by month</p>
            <h2 id="by-month" className={styles.h2}>
              {worstMonth && worstMonth.avg !== null
                ? `Worst month: ${monthLabel(worstMonth.month)}, ${fmt1(worstMonth.avg)} min late on average`
                : "Average delay by month"}
            </h2>
            {networkWorst ? (
              <p className={styles.sub}>
                The whole network averaged {fmt1(networkWorst.avgDelayMin)} min that month. The dashed
                line is the network average.
              </p>
            ) : null}
            <div className={styles.card}>
              <TrainMonthChart
                monthly={t.monthly}
                networkAvg={monthly.months.map((m) => ({ month: m.month, avg: m.avgDelayMin }))}
              />
            </div>
          </section>

          {t.stops.length > 0 ? (
            <section className={styles.section} aria-labelledby="route">
              <p className="eyebrow">The route</p>
              <h2 id="route" className={styles.h2}>
                {jump
                  ? `Biggest jump: +${fmt1(jump.delta)} min between ${jump.from} and ${jump.to}`
                  : "Where the minutes pile up"}
              </h2>
              <p className={styles.sub}>
                Stops of the most common stop sequence, used by {fmtInt(t.stopsSequenceRuns)} of{" "}
                {fmtInt(t.runs)} runs. Each number is the average delay at that stop.
              </p>
              <div className={styles.card}>
                <RouteStrip stops={t.stops} />
              </div>
            </section>
          ) : null}

          {t.worstRun ? (
            <section className={`${styles.section} ${styles.worst}`} aria-labelledby="worst-run">
              <p className={styles.worstLabel}>Worst run</p>
              <h2 id="worst-run" className={styles.worstFigure}>
                {fmtDuration(t.worstRun.delayMin)} late
              </h2>
              <p className={styles.worstText}>
                On {fmtDate(t.worstRun.date)}, {t.worstRun.origin} → {t.worstRun.dest}. Somebody
                definitely missed their connection.
              </p>
            </section>
          ) : null}

          {prev || next ? (
            <nav className={styles.pager} aria-label={`Neighbours in the ranking ${navUnit}`}>
              {prev ? (
                <Link href={`/train/${prev.slug}/`} className={styles.pagerLink}>
                  <span className={styles.pagerHint}>← #{navIndex} {navUnit}</span>
                  <span className={styles.pagerName}>{prev.train}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={`/train/${next.slug}/`} className={`${styles.pagerLink} ${styles.pagerNext}`}>
                  <span className={styles.pagerHint}>
                    #{navIndex + 2} {navUnit} →
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
