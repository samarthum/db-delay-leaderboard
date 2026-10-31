import Link from "next/link";
import type { RouteEntry, RouteTrain } from "@/lib/types";
import { getReverseRoute, getRouteCompensation, getRoutes, getStats, getUnitSlugs } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmt1, fmtDuration, fmtInt, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { RouteList } from "../RouteList";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { ShareButton } from "../ShareButton";
import { LiveBoard } from "../LiveBoard";
import { SaveButton } from "../SaveButton";
import { NearTime, type NearRow } from "../NearTime";
import { StopLine } from "../charts";
import { TrainList, type TrainRow } from "../TrainList";
import { RememberPage, StickyTitle } from "../PageTools";


function trainHref(t: RouteTrain, slugs: Set<string>, lang: Lang): string | null {
  const slug = `${t[0]}-${t[1]}`.toLowerCase();
  return slugs.has(slug) ? route(lang, "train", slug) : null;
}

/**
 * A route page: the route, then the answer with both rules, then the visitor's own question, then where the delay
 * builds and which train to take. The same skeleton as a train page, so a reader learns it once.
 */
export function RoutePage({ r, lang }: { r: RouteEntry; lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const w = stats.window;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const all = getRoutes();
  const slugs = new Set(getUnitSlugs("longDistance"));
  const reverse = getReverseRoute(r);
  const comp = getRouteCompensation(r.slug);
  const others = all.routes.filter((x) => x.from === r.from && x.slug !== r.slug).sort((a, b) => b.trips - a.trips).slice(0, 5);
  const url = absoluteUrl(route(lang, "route", r.slug));
  const shareText = t("route.shareText", { from: r.from, to: r.to, avg: Math.round(r.avg), pct: fmtShare1(r.late, lang), pct6: fmtShare1(r.late6, lang), span });
  const nearRows: NearRow[] = r.list.map((tr) => ({ name: `${tr[0]} ${tr[1]}`, href: trainHref(tr, slugs, lang), dep: tr[2], arr: tr[3], late: tr[4] }));

  const pts = r.curve ? r.curve.points : [];
  let jump: { i: number; from: string; to: string } | null = null;
  let best = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i][1] - pts[i - 1][1];
    if (d > best) {
      best = d;
      jump = { i, from: pts[i - 1][0], to: pts[i][0] };
    }
  }
  const xmax = pts.length ? Math.max(40, Math.ceil(Math.max(...pts.map((p) => p[1])) / 20) * 20) : 60;


  const trainRows: TrainRow[] = r.list.map((tr) => ({ t: tr, href: trainHref(tr, slugs, lang) }));
  const facts = (
    <dl className="kv">
      <div>
        <dt>
          {t("route.avgTile")}
          <small>{t("route.avgOn", { to: r.to })}</small>
        </dt>
        <dd>
          {fmt1(r.avg, lang)} {t("unit.min")}
        </dd>
      </div>
      <div>
        <dt>
          {t("route.cancTile")}
          <small>{t("route.cancNote", { n: fmtInt(r.runs, lang) })}</small>
        </dt>
        <dd>{fmtShare1(r.canc, lang)}</dd>
      </div>
      {comp && comp[1] !== null ? (
        <div>
          <dt>{t("route.hourTile")}</dt>
          <dd>{fmtShare1(comp[1], lang)}</dd>
        </div>
      ) : null}
    </dl>
  );

  return (
    <main id="main" className="container page">
      <RememberPage lang={lang} item={{ href: route(lang, "route", r.slug), title: `${r.from} → ${r.to}`, sub: t("route.sub", { n: fmtInt(r.trains, lang), dur: fmtDuration(r.minutes, lang) }), value: t("list.avg", { x: fmt1(r.avg, lang) }) }} />
      <StickyTitle title={`${r.from} → ${r.to}`} value={t("list.avg", { x: fmt1(r.avg, lang) })} />
      <Link href={route(lang, "routes")} className="back" prefetch={false}>
        <Arrow back /> {t("route.back")}
      </Link>

      <div className="two-col">
        <div className="main">
          <div className="titlerow">
            <h1 className="h1">
              <RouteName from={r.from} to={r.to} word={t("route.to")} />
            </h1>
            <div className="acts">
              {reverse ? (
                <Link href={route(lang, "route", reverse.slug)} className="iconlink" prefetch={false} aria-label={t("route.swap", { from: reverse.from, to: reverse.to })} title={t("route.swap", { from: reverse.from, to: reverse.to })}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="square" aria-hidden="true">
                    <path d="M7 4v15M3.5 15.5L7 19l3.5-3.5M17 20V5M13.5 8.5L17 5l3.5 3.5" />
                  </svg>
                </Link>
              ) : null}
              <SaveButton lang={lang} item={{ kind: "route", href: route(lang, "route", r.slug), title: `${r.from} → ${r.to}`, sub: t("route.sub", { n: fmtInt(r.trains, lang), dur: fmtDuration(r.minutes, lang) }), avg: r.avg }} />
              <ShareButton look="icon" lang={lang} title={`${r.from} → ${r.to} · German Punctuality`} text={shareText} url={url} label={t("route.share")} image={routeImagePath(w.lastMonth, `${r.slug}-portrait`, lang)} filename={r.slug} />
            </div>
          </div>
          <p className="lead" style={{ marginTop: 6, fontSize: 16 }}>
            {t("route.sub", { n: fmtInt(r.trains, lang), dur: fmtDuration(r.minutes, lang) })}
            {r.rank !== null ? ` ${t("route.rankLine", { n: r.rank, total: all.leagueSize })}` : ""}
          </p>

          <Figure
            avg={r.avg}
            pct={r.late}
            pct6={r.late6}
            lang={lang}
            sentence={<Rich text={t("fig.route", { to: r.to })} />}
            basis={t("home.networkBasis", { trips: fmtInt(r.trips, lang), span })}
          />

          <LiveBoard from={r.from} to={r.to} lang={lang} />

          <NearTime rows={nearRows} from={r.from} lang={lang} />

          <section className="blk" aria-labelledby="trains">
            <h2 id="trains">{t("route.trains.heading")}</h2>
            <TrainList rows={trainRows} lang={lang} />
          </section>
        </div>

        <div className="aside">

          <div className="folds">
            <details className="fold">
              <summary>
                <span>
                  {t("route.facts")}
                  <small>
                    {fmt1(r.avg, lang)} {t("unit.min")} · {fmtShare1(r.canc, lang)} {t("route.cancTile").toLowerCase()}
                  </small>
                </span>
              </summary>
              <div className="body">{facts}</div>
            </details>
            {pts.length > 0 && r.curve ? (
              <details className="fold">
                <summary>
                  <span>
                    {jump ? t("route.curve.jump", { from: jump.from, to: jump.to }) : t("route.curve.default")}
                  </span>
                </summary>
                <div className="body">
                  <p className="sec-sub">{t("route.curve.sub", { train: r.curve.train })}</p>
                  <StopLine
                    points={pts.map((p) => ({ name: p[0], value: p[1] }))}
                    lang={lang}
                    unit="pct"
                    xmax={xmax}
                    jump={jump?.i ?? null}
                    label={t("route.curve.aria", { train: r.curve.train, list: pts.map((p) => `${p[0]} ${fmtShare1(p[1], lang)}`).join(", ") })}
                  />
                </div>
              </details>
            ) : null}
            {others.length > 0 ? (
              <details className="fold">
                <summary>
                  <span>{t("route.more", { from: r.from })}</span>
                </summary>
                <div className="body">
                  <RouteList rows={others} lang={lang} />
                  <Link href={route(lang, "routes")} className="more" prefetch={false}>
                    {t("route.rankings")} <Arrow />
                  </Link>
                </div>
              </details>
            ) : null}
            <Link href={`${route(lang, "change")}?s=${encodeURIComponent(r.to)}#typical`} className="rowlink" prefetch={false}>
              <span>{t("route.changes", { to: r.to })}</span>
            </Link>
            <Link href={route(lang, "compensation")} className="rowlink" prefetch={false}>
              <span>{t("route.hourLink")}</span>
            </Link>
          </div>
          <p className="note" style={{ marginTop: 20 }}>
            {t("route.method", { from: r.from, to: r.to, measured: fmtInt(r.trips, lang), runs: fmtInt(r.runs, lang), unlisted: fmtInt(r.unlisted, lang), span })}
          </p>
        </div>
      </div>
    </main>
  );
}
