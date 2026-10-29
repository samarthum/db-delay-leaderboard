import Link from "next/link";
import type { Mode, Stats, TrainSummary } from "@/lib/types";
import { delayColor } from "@/lib/colors";
import { ModePanel, ModeToggle } from "./ModeToggle";
import { MoreRanks } from "./MoreRanks";
import { MODES } from "./pageFormat";
import styles from "./Leaderboard.module.css";

function Row({ train: t, mode, rank }: { train: TrainSummary; mode: Mode; rank: number }) {
  return (
    <li>
      <Link
        href={`/train/${t.slug}/`}
        className={styles.row}
        style={{ "--heat": delayColor(t.minutes.avg) } as React.CSSProperties}
      >
        <span className={styles.rank}>
          <span className="visually-hidden">Rank </span>
          {rank}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{t.train}</span>
          <span className={styles.route}>
            {t.origin} <span aria-hidden="true">→</span>
            <span className="visually-hidden"> to </span> {t.dest}
          </span>
        </span>
        <span className={styles.value}>{MODES[mode].value(t)}</span>
      </Link>
    </li>
  );
}

export function Leaderboard({ stats }: { stats: Stats }) {
  const { topN } = stats.params;

  return (
    <section id="leaderboard" className={styles.section} aria-label="Ranking">
      <div className="container">
        <div className={styles.controls}>
          <ModeToggle />
        </div>

        {(Object.keys(MODES) as Mode[]).map((mode) => {
          const list = stats.rankings[mode];
          const more = list.slice(topN);
          return (
            <ModePanel key={mode} mode={mode}>
              <p className={styles.explain}>{MODES[mode].explain}</p>
              <ol className={`${styles.list} ${styles.top}`}>
                {list.slice(0, topN).map((t, i) => (
                  <Row key={t.slug} train={t} mode={mode} rank={i + 1} />
                ))}
              </ol>
              {more.length > 0 ? (
                <MoreRanks label={`${more.length} more`}>
                  <ol className={styles.list} start={topN + 1}>
                    {more.map((t, i) => (
                      <Row key={t.slug} train={t} mode={mode} rank={topN + 1 + i} />
                    ))}
                  </ol>
                </MoreRanks>
              ) : null}
            </ModePanel>
          );
        })}
      </div>
    </section>
  );
}
