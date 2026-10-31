import Link from "next/link";
import { getMonthly, getStations, getStats } from "@/lib/data";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { MonthlyChart } from "../MonthlyChart";
import { StationMap } from "../StationMap";

export function NetworkPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  return (
    <main id="main" className="container page">
      <div style={{ maxWidth: 720 }}>
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("network.title")}
      </h1>
      <section className="blk net-month" aria-labelledby="monthly-title" style={{ marginTop: 16 }}>
        <h2 id="monthly-title" className="visually-hidden">{t("network.monthly.title")}</h2>
        <MonthlyChart series={getMonthly().series} lang={lang} />
      </section>
      <StationMap stations={getStations().stations} params={stats.params} window={stats.window} lang={lang} />
      </div>
    </main>
  );
}
