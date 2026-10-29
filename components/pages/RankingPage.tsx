import { getStats } from "@/lib/data";
import { spanLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { RankingProvider } from "../Ranking";
import { Leaderboard } from "../Leaderboard";
import styles from "./Page.module.css";

export function RankingPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const w = stats.window;
  return (
    <main id="main" className={`container ${styles.page}`}>
      <h1 id="leaderboard-title" className={styles.title}>
        {t("ranking.title")}
      </h1>
      <p className={styles.sub}>{t("ranking.sub", { span: spanLabel(w.firstMonth, w.lastMonth, lang) })}</p>
      <RankingProvider>
        <Leaderboard stats={stats} lang={lang} />
      </RankingProvider>
    </main>
  );
}
