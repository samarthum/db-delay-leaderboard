import Link from "next/link";
import type { Category, Mode, Stats, UnitSummary } from "@/lib/types";
import { delayColor } from "@/lib/colors";
import { unitHref } from "@/lib/site";
import { RankingControls, RankingPanel } from "./Ranking";
import { MoreRanks } from "./MoreRanks";
import { RouteText } from "./RouteText";
import { MODES } from "./pageFormat";
import styles from "./Leaderboard.module.css";

function Row({ unit: t, mode, rank }: { unit: UnitSummary; mode: Mode; rank: number }) {
  return (
    <li>
      <Link href={unitHref(t)} className={styles.row} style={{ "--heat": delayColor(t.minutes.avg) } as React.CSSProperties}>
        <span className={styles.rank}>
          <span className="visually-hidden">Rank </span>
          {rank}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{t.name}</span>
          <span className={styles.route}>
            <RouteText unit={t} />
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
    <section id="leaderboard" className={`section ${styles.section}`} aria-labelledby="leaderboard-title">
      <div className="container">
        <h2 id="leaderboard-title" className="section-title">
          The most delayed
        </h2>
        <div className={styles.controls}>
          <RankingControls />
        </div>

        {(Object.keys(stats.rankings) as Category[]).flatMap((category) =>
          (Object.keys(MODES) as Mode[]).map((mode) => {
            const list = stats.rankings[category][mode];
            const more = list.slice(topN);
            return (
              <RankingPanel key={`${category}/${mode}`} category={category} mode={mode}>
                <p className={styles.explain}>{MODES[mode].explain}</p>
                <ol className={`${styles.list} ${styles.top}`}>
                  {list.slice(0, topN).map((t, i) => (
                    <Row key={t.slug} unit={t} mode={mode} rank={i + 1} />
                  ))}
                </ol>
                {more.length > 0 ? (
                  <MoreRanks label={`${more.length} more`}>
                    <ol className={styles.list} start={topN + 1}>
                      {more.map((t, i) => (
                        <Row key={t.slug} unit={t} mode={mode} rank={topN + 1 + i} />
                      ))}
                    </ol>
                  </MoreRanks>
                ) : null}
              </RankingPanel>
            );
          }),
        )}
      </div>
    </section>
  );
}
