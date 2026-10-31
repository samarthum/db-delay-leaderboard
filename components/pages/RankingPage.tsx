import Link from "next/link";
import type { Category, UnitSummary } from "@/lib/types";
import { getRoutes, getStats } from "@/lib/data";
import { delayColor, lateShareColor } from "@/lib/colors";
import { fmt1, fmtInt, fmtShare, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { unitHref } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { RouteText } from "../RouteText";
import { Tabs } from "../Tabs";
import { RouteRanking } from "../RouteRanking";

function UnitTable({ list, lang, category }: { list: UnitSummary[]; lang: Lang; category: Category }) {
  const t = makeT(lang);
  const top = Math.max(...list.map((u) => u.minutes.avg), 1);
  return (
    <table className="bt">
      <colgroup>
        <col style={{ width: 28 }} />
        <col />
        <col style={{ width: 56 }} />
        <col style={{ width: 62 }} />
      </colgroup>
      <thead>
        <tr>
          <th />
          <th>{t(category === "longDistance" ? "rank.th.train" : "rank.th.line")}</th>
          <th />
          <th className="r">{t("rank.th.avg")}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((u, i) => (
          <tr key={u.slug} className="tap">
            <td className="rk">{i + 1}</td>
            <td className="two">
              <Link href={unitHref(u, lang)} prefetch={false}>
                <b>{u.name}</b>
                <span>
                  <RouteText unit={u} lang={lang} />
                </span>
              </Link>
            </td>
            <td className="bar">
              <span>
                <i style={{ width: `${Math.max(2, (100 * u.minutes.avg) / top)}%`, background: delayColor(u.minutes.avg) }} />
              </span>
            </td>
            <td className="v">{t("rank.avg", { x: fmt1(u.minutes.avg, lang) })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Rankings: one page, three tables. Routes first (people ask about trips), then long-distance trains, then regional lines.
 * The full list of every route has its own page behind a link.
 */
export function RankingPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const w = stats.window;
  const data = getRoutes();
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number));
  const worst = league.slice(0, 10);
  const trains = stats.rankings.longDistance.minutes.slice(0, 10);
  const lines = stats.rankings.regional.minutes.slice(0, 10);

  return (
    <main id="main" className="container page">
      <div style={{ maxWidth: 720 }}>
      <h1 className="h1" style={{ marginTop: 20 }}>
        {t("rank.title")}
      </h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {t("rank.lead")} {spanLabel(w.firstMonth, w.lastMonth, lang)}.
      </p>
      <Tabs ids={["routes", "trains", "lines"]} labels={[t("rank.jump.routes"), t("rank.tab.trains"), t("rank.tab.lines")]} label={t("rank.jump")}>
        <section className="blk" aria-labelledby="routes-h" style={{ marginTop: 20 }}>
          <h2 id="routes-h">{t("rank.avg.title")}</h2>
          <RouteRanking league={league} lang={lang} />
          <Link href={route(lang, "routes")} className="more" prefetch={false}>
            {t("routes.all", { n: data.routes.length })} <Arrow />
          </Link>
        </section>
        <section className="blk" aria-labelledby="trains-h" style={{ marginTop: 20 }}>
          <h2 id="trains-h">{t("rank.trains.title")}</h2>
          <p className="sec-sub">{t("rank.trains.sub")}</p>
          <UnitTable list={trains} lang={lang} category="longDistance" />
        </section>
        <section className="blk" aria-labelledby="lines-h" style={{ marginTop: 20 }}>
          <h2 id="lines-h">{t("rank.lines.title")}</h2>
          <p className="sec-sub">{t("rank.lines.sub")}</p>
          <UnitTable list={lines} lang={lang} category="regional" />
        </section>
      </Tabs>
      </div>
    </main>
  );
}
