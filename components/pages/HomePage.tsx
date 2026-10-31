import Link from "next/link";
import { getRoutes, getStats } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmtInt, fmtShare, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { RouteList } from "../RouteList";
import { YourTrains } from "../YourTrains";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { Search } from "../search/Search";

/** Most often late routes: five on a phone, ten on a wide screen. A way in for a visitor with no train in mind. */
function TopRoutes({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => b.avg - a.avg);
  return (
    <section className="sec" aria-labelledby="top-routes">
      <h2 id="top-routes">{t("home.top.title")}</h2>
      <p className="sec-sub">{t("home.top.sub", { n: league.length })}</p>
      <RouteList rows={league.slice(0, 10)} lang={lang} rank wideOnlyFrom={5} />
      <Link href={route(lang, "routes")} className="more" prefetch={false}>
        {t("home.top.all", { n: getRoutes().routes.length })} <Arrow />
      </Link>
    </section>
  );
}

/**
 * The home page: the answer first (how late are long-distance trains, by our rule and by DB's), the one box that looks
 * up a train, route or station with a one-line link to "Will my connection work?" under it, then where trains are late most often.
 */
export function HomePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const ld = stats.recap.longDistance;
  const w = stats.window;
  const figure = (
    <>
    <YourTrains lang={lang} />
    <Figure
      avg={ld.avgDelayMin}
      pct={ld.latePct}
      pct6={ld.late6Pct}
      lang={lang}
      sentence={<Rich text={t("fig.home")} />}
      basis={t("home.basis", { trips: fmtInt(ld.measured, lang), span: spanLabel(w.firstMonth, w.lastMonth, lang) })}
    />
    </>
  );
  const idle = <TopRoutes lang={lang} />;
  return (
    <main id="main" className="container page">
      <Search lang={lang} idle={idle} figure={figure} title={t("home.title")} />
    </main>
  );
}
