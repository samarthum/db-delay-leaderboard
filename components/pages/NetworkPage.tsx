import { getMonthly, getStations, getStats } from "@/lib/data";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { MonthlyChart } from "../MonthlyChart";
import { StationMap } from "../StationMap";
import styles from "./Page.module.css";

export function NetworkPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  return (
    <main id="main" className={`container ${styles.page}`}>
      <h1 className={styles.title}>{t("network.title")}</h1>
      <section className={styles.block} aria-labelledby="monthly-title">
        <h2 id="monthly-title" className="section-title">
          {t("network.monthly.title")}
        </h2>
        <div className={styles.block}>
          <MonthlyChart series={getMonthly().series} lang={lang} />
        </div>
      </section>
      <div className={styles.h2Space}>
        <StationMap stations={getStations().stations} params={stats.params} window={stats.window} lang={lang} />
      </div>
    </main>
  );
}
