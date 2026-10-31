import Link from "next/link";
import type { RouteEntry } from "@/lib/types";
import { getRoutes } from "@/lib/data";
import { fmt1, fmtInt, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow } from "../Arrow";
import { RouteList } from "../RouteList";
import { ShareButton } from "../ShareButton";

function RouteRows({ rows, lang, ranked }: { rows: RouteEntry[]; lang: Lang; ranked?: boolean; db?: boolean }) {
  return <RouteList rows={rows} lang={lang} rank={ranked} />;
}

/** Every route that has a page: the ones late most often, the ones closest to the timetable, and the whole list A to Z. */
export function RoutesPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const span = spanLabel(data.window.firstMonth, data.window.lastMonth, lang);
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => b.avg - a.avg);
  const worst = league.slice(0, 10);
  const best = league.slice(-5).reverse();
  const all = [...data.routes].sort((a, b) => a.from.localeCompare(b.from, "de") || a.to.localeCompare(b.to, "de"));
  const top = worst[0];
  const bottom = best[0];
  const shareText = t("routes.shareText", { from: top.from, to: top.to, pct: fmt1(top.avg, lang), bestFrom: bottom.from, bestTo: bottom.to, bestPct: fmt1(bottom.avg, lang) });

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
            <RouteRows rows={best} lang={lang} />
          </section>
        </div>
      </div>

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
