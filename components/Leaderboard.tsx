import Link from "next/link";
import type { Mode, Stats } from "@/lib/types";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import { SectionHeader } from "./SectionHeader";
import { ModePanel, ModeToggle } from "./ModeToggle";
import { MoreRanks } from "./MoreRanks";
import { TrainCard, TrainTableHeader } from "./TrainCard";
import styles from "./Leaderboard.module.css";

const MODES: Mode[] = ["minutes", "percent"];

export function Leaderboard({ stats }: { stats: Stats }) {
  const { params, overall } = stats;
  const { topN } = params;

  return (
    <section id="leaderboard" className="section" aria-labelledby="leaderboard-title">
      <div className="container">
        <SectionHeader eyebrow="The leaderboard" title="Now departing: late" id="leaderboard-title">
          <p>
            Two ways to be late. Night trains rack up the minutes. Short hops rack up the
            percentages, because 15 minutes hurts more on a 30-minute ride. Pick your poison.
          </p>
        </SectionHeader>

        <div className={styles.controls}>
          <ModeToggle />
        </div>
        <p className={styles.hint}>
            Ranked from <strong>{fmtInt(overall.poolSize)} trains</strong> with at least{" "}
            {params.minRunsForPool} measured runs. The % list also needs {params.minRunsForPool} runs
            scheduled for at least {params.minScheduledMinutesForPct} minutes. Ties go alphabetically.
        </p>

        {MODES.map((mode) => {
          const list = stats.rankings[mode];
          const top = list.slice(0, topN);
          const more = list.slice(topN);
          return (
            <ModePanel key={mode} mode={mode}>
              <TrainTableHeader mode={mode} />
              <ol className={styles.list}>
                {top.map((t, i) => (
                  <TrainCard key={t.slug} train={t} mode={mode} rank={i + 1} index={i} />
                ))}
              </ol>
              {more.length > 0 ? (
                <MoreRanks label={`ranks ${topN + 1}–${topN + more.length}`}>
                  <ol className={styles.compact} start={topN + 1}>
                    {more.map((t, i) => (
                      <li key={t.slug}>
                        <Link href={`/train/${t.slug}/`} className={styles.row}>
                          <span className={styles.rowRank}>{topN + 1 + i}</span>
                          <span className={styles.rowWho}>
                            <span className={styles.rowName}>{t.train}</span>
                            <span className={styles.rowRoute}>
                              {t.origin} → {t.dest}
                            </span>
                          </span>
                          <span className={styles.rowNums}>
                            <span className={mode === "minutes" ? styles.rowPrimary : undefined}>
                              {fmt1(t.minutes.avg)} min
                            </span>
                            <span className={mode === "percent" ? styles.rowPrimary : undefined}>
                              {fmtPct(t.percent.avg)}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </MoreRanks>
              ) : null}
            </ModePanel>
          );
        })}

        <p className={styles.note}>
          Routes show each train&rsquo;s most common first and last stop. Delays are measured at the
          last non-cancelled stop with a scheduled arrival, which for international trains is the
          last German stop. Average delay in minutes, % = delay as a share of the scheduled journey.
        </p>
      </div>
    </section>
  );
}
