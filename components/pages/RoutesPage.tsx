import Link from "next/link";
import type { RouteEntry } from "@/lib/types";
import { getRoutes } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmtInt, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { ShareButton } from "../ShareButton";
import { Search } from "../search/Search";

function RouteRows({ rows, lang, ranked, db }: { rows: RouteEntry[]; lang: Lang; ranked?: boolean; db?: boolean }) {
  const t = makeT(lang);
  return (
    <table className="bt">
      <colgroup>
        {ranked ? <col style={{ width: 28 }} /> : null}
        <col />
        <col style={{ width: 56 }} />
        <col style={{ width: 62 }} />
      </colgroup>
      <tbody>
        {rows.map((r) => (
          <tr key={r.slug} className="tap">
            {ranked ? <td className="rk">{r.rank}</td> : null}
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
            <td className="v">
              {fmtShare(r.late, lang)}
              {db ? <small>{t("rank.db", { pct: fmtShare(r.late6, lang) })}</small> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Every route that has a page: the ones late most often, the ones closest to the timetable, and the whole list A to Z. */
export function RoutesPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const span = spanLabel(data.window.firstMonth, data.window.lastMonth, lang);
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number));
  const worst = league.slice(0, 10);
  const best = league.slice(-5).reverse();
  const all = [...data.routes].sort((a, b) => a.from.localeCompare(b.from, "de") || a.to.localeCompare(b.to, "de"));
  const top = worst[0];
  const bottom = best[0];
  const shareText = t("routes.shareText", { from: top.from, to: top.to, pct: fmtShare1(top.late, lang), bestFrom: bottom.from, bestTo: bottom.to, bestPct: fmtShare1(bottom.late, lang) });

  return (
    <main id="main" className="container page">
      <Link href={route(lang, "ranking")} className="back" prefetch={false}>
        <Arrow back /> {t("rank.title")}
      </Link>
      <h1 className="h1" style={{ marginTop: 4 }}>
        {t("routes.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {t("routes.sub", { n: league.length, span })}
      </p>
      <div className="actions">
        <ShareButton lang={lang} title={`${t("routes.title")} · German Punctuality`} text={shareText} url={absoluteUrl(route(lang, "routes"))} label={t("routes.share")} image={routeImagePath(data.window.lastMonth, "ranking-portrait", lang)} filename="german-punctuality-routes" />
      </div>

      <div className="two-col wide">
        <div className="main">
          <section className="sec" aria-labelledby="worst">
            <h2 id="worst">{t("routes.latest")}</h2>
            <p className="sec-sub">{t("routes.latestSub", { n: league.length })}</p>
            <RouteRows rows={worst} lang={lang} ranked db />
          </section>
        </div>
        <div className="aside">
          <section className="sec" aria-labelledby="best">
            <h2 id="best">{t("routes.best")}</h2>
            <p className="sec-sub">{t("routes.bestSub")}</p>
            <RouteRows rows={best} lang={lang} ranked db />
          </section>
        </div>
      </div>

      <section className="sec" aria-labelledby="find">
        <h2 id="find">{t("routes.search")}</h2>
        <div style={{ maxWidth: 560 }}>
          <Search lang={lang} variant="inline" />
        </div>
      </section>

      <section className="sec" aria-labelledby="all">
        <h2 id="all">{t("routes.all", { n: all.length })}</h2>
        <p className="sec-sub">{t("routes.allSub", { trips: fmtInt(data.params.minTrips, lang) })}</p>
        <details className="disc">
          <summary>{t("routes.all", { n: all.length })}</summary>
          <RouteRows rows={all} lang={lang} />
        </details>
      </section>

      <p className="note" style={{ marginTop: 24 }}>
        {t("routes.how", { trips: fmtInt(data.params.minTrips, lang) })}
      </p>
    </main>
  );
}
