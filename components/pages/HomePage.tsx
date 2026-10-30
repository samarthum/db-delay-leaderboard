import Link from "next/link";
import { getRoutes, getStats } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmtInt, fmtShare, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { ConnectionTool } from "../ConnectionTool";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { Search } from "../search/Search";

/** Most often late routes: five on a phone, ten on a wide screen. A way in for a visitor with no train in mind. */
function TopRoutes({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number));
  return (
    <section className="sec" aria-labelledby="top-routes">
      <h2 id="top-routes">{t("home.top.title")}</h2>
      <p className="sec-sub">{t("home.top.sub", { n: league.length })}</p>
      <table className="bt">
        <colgroup>
          <col style={{ width: 28 }} />
          <col />
          <col style={{ width: 64 }} />
          <col style={{ width: 56 }} />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th>{t("home.top.th1")}</th>
            <th />
            <th className="r">{t("home.top.th2")}</th>
          </tr>
        </thead>
        <tbody>
          {league.slice(0, 10).map((r, i) => (
            <tr key={r.slug} className={`tap${i >= 5 ? " wide-only" : ""}`}>
              <td className="rk">{r.rank}</td>
              <td className="two">
                <Link href={route(lang, "route", r.slug)} prefetch={false}>
                  <b>
                    <RouteName from={r.from} to={r.to} word={t("route.to")} />
                  </b>
                  <span>{t("home.top.trips", { n: fmtInt(r.trips, lang) })}</span>
                </Link>
              </td>
              <td className="bar">
                <span>
                  <i style={{ width: `${r.late}%`, background: lateShareColor(r.late) }} />
                </span>
              </td>
              <td className="v">{fmtShare(r.late, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link href={route(lang, "routes")} className="more" prefetch={false}>
        {t("home.top.all", { n: getRoutes().routes.length })} <Arrow />
      </Link>
    </section>
  );
}

/**
 * The home page: the answer first (how late are long-distance trains, by our rule and by DB's), then the one box that
 * looks up a train, route or station, then "Will my connection work?", then where trains are late most often.
 */
export function HomePage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const ld = stats.recap.longDistance;
  const w = stats.window;
  const figure = (
    <Figure
      pct={ld.latePct}
      pct6={ld.late6Pct}
      lang={lang}
      sentence={<Rich text={t("home.figure")} />}
      basis={t("home.basis", { trips: fmtInt(ld.measured, lang), span: spanLabel(w.firstMonth, w.lastMonth, lang) })}
    />
  );
  const idle = (
    <>
      <section className="sec" id="connection">
        <ConnectionTool lang={lang} />
      </section>
      <TopRoutes lang={lang} />
    </>
  );
  return (
    <main id="main" className="container page">
      <Search lang={lang} idle={idle} figure={figure} title={t("home.title")} />
    </main>
  );
}
