import Link from "next/link";
import type { Category, Mode, Stats, UnitSummary } from "@/lib/types";
import { delayColor } from "@/lib/colors";
import { unitHref } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { RankingControls, RankingPanel } from "./Ranking";
import { MoreRanks } from "./MoreRanks";
import { RouteText } from "./RouteText";
import { MODE_LIST, categoryCopy, modeCopy } from "./pageFormat";
import styles from "./Leaderboard.module.css";

function Row({ unit: t, mode, rank, lang }: { unit: UnitSummary; mode: Mode; rank: number; lang: Lang }) {
  const tr = makeT(lang);
  return (
    <li>
      <Link href={unitHref(t, lang)} prefetch={false} className={styles.row} style={{ "--heat": delayColor(t.minutes.avg) } as React.CSSProperties}>
        <span className={styles.rank}>
          <span className="visually-hidden">{tr("ranking.rank")} </span>
          {rank}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{t.name}</span>
          <span className={styles.route}>
            <RouteText unit={t} lang={lang} />
          </span>
        </span>
        <span className={styles.value}>{modeCopy(lang, mode).value(t)}</span>
      </Link>
    </li>
  );
}

export function Leaderboard({ stats, lang }: { stats: Stats; lang: Lang }) {
  const { topN } = stats.params;
  const t = makeT(lang);

  return (
    <section id="leaderboard" className={styles.section} aria-labelledby="leaderboard-title">
      <div className={styles.controls}>
        <RankingControls lang={lang} />
      </div>

      {(Object.keys(stats.rankings) as Category[]).flatMap((category) =>
        MODE_LIST.map((mode) => {
          const list = stats.rankings[category][mode];
          const more = list.slice(topN);
          const note = categoryCopy(lang, category).note;
          return (
            <RankingPanel key={`${category}/${mode}`} category={category} mode={mode} lang={lang}>
              <p className={styles.explain}>
                {modeCopy(lang, mode).explain}
                {note ? ` ${note}` : ""}
              </p>
              <ol className={`${styles.list} ${styles.top}`}>
                {list.slice(0, topN).map((u, i) => (
                  <Row key={u.slug} unit={u} mode={mode} rank={i + 1} lang={lang} />
                ))}
              </ol>
              {more.length > 0 ? (
                <MoreRanks showLabel={t("ranking.show", { n: more.length })} hideLabel={t("ranking.hide", { n: more.length })}>
                  <ol className={styles.list} start={topN + 1}>
                    {more.map((u, i) => (
                      <Row key={u.slug} unit={u} mode={mode} rank={topN + 1 + i} lang={lang} />
                    ))}
                  </ol>
                </MoreRanks>
              ) : null}
            </RankingPanel>
          );
        }),
      )}
    </section>
  );
}
