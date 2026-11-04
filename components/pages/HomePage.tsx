import Link from "next/link";
import { getRoutes, getStats } from "@/lib/data";
import { fmtInt, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { RouteList } from "../RouteList";
import { YourTrains } from "../YourTrains";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { Search } from "../search/Search";
import { PageLd, SiteLd } from "../PageLd";
import { homeMetadata } from "@/lib/seo";

/** Most often late routes: five on a phone, ten on a wide screen. A way in for a visitor with no train in mind. */
function TopRoutes({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => b.avg - a.avg);
  return (
    <section className="sec home-routes" aria-labelledby="top-routes">
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
 * The home page is built around "my train today": the question, one line on what you get, the box that finds your
 * train (by number, route with a time, or station), and right under it the trains you saved or looked up, with today's
 * live status at both ends. The network-wide figure, the most delayed routes and the rest of the site follow.
 */
export function HomePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const ld = stats.recap.longDistance;
  const w = stats.window;
  const lead = <p className="home-lead">{t("home.lead")}</p>;
  const idle = (
    <div className="home-idle">
      <YourTrains lang={lang} />
      <section className="sec home-net" aria-labelledby="home-net">
        <h2 id="home-net">{t("home.net.title")}</h2>
        <Figure
          avg={ld.avgDelayMin}
          pct={ld.latePct}
          pct6={ld.late6Pct}
          lang={lang}
          sentence={<Rich text={t("fig.home")} />}
          basis={t("home.basis", { trips: fmtInt(ld.measured, lang), span: spanLabel(w.firstMonth, w.lastMonth, lang) })}
        />
      </section>
      <TopRoutes lang={lang} />
    </div>
  );
  return (
    <main id="main" className="container page">
      <SiteLd lang={lang} />
      <PageLd lang={lang} path={route(lang, "home")} meta={homeMetadata(lang)} name={t("home.title")} />
      <Search lang={lang} idle={idle} figure={lead} title={t("home.title")} />
    </main>
  );
}
