import Link from "next/link";
import type { RouteEntry, RouteTrain } from "@/lib/types";
import { getReverseRoute, getRouteCompensation, getRoutes, getStats, getUnitSlugs } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmt1, fmtDuration, fmtInt, fmtShare, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { Arrow, RouteName } from "../Arrow";
import { Figure } from "../Figure";
import { Rich } from "../Rich";
import { ShareButton } from "../ShareButton";
import { LiveBoard } from "../LiveBoard";
import { NearTime, type NearRow } from "../NearTime";
import { StopLine } from "../charts";
import { Search } from "../search/Search";

const SHOWN = 10;

function trainHref(t: RouteTrain, slugs: Set<string>, lang: Lang): string | null {
  const slug = `${t[0]}-${t[1]}`.toLowerCase();
  return slugs.has(slug) ? route(lang, "train", slug) : null;
}

function TrainRows({ rows, lang, slugs }: { rows: RouteTrain[]; lang: Lang; slugs: Set<string> }) {
  const t = makeT(lang);
  return (
    <>
      {rows.map((tr) => {
        const href = trainHref(tr, slugs, lang);
        const name = `${tr[0]} ${tr[1]}`;
        return (
          <tr key={name} className={tr[4] === null ? "few ro" : "tap"}>
            <td className="time">
              {clock(tr[2])}
              <span>{clock(tr[3])}</span>
            </td>
            <td className="tn">{href ? <Link href={href} prefetch={false}>{name}</Link> : name}</td>
            <td className="bar">
              {tr[4] === null ? null : (
                <span>
                  <i style={{ width: `${tr[4]}%`, background: lateShareColor(tr[4]) }} />
                </span>
              )}
            </td>
            <td className="v">{tr[4] === null ? <small>{t("route.trains.few")}</small> : fmtShare(tr[4], lang)}</td>
          </tr>
        );
      })}
    </>
  );
}

function TrainTable({ rows, lang, slugs, head }: { rows: RouteTrain[]; lang: Lang; slugs: Set<string>; head?: boolean }) {
  const t = makeT(lang);
  return (
    <table className="bt tt">
      <colgroup>
        <col style={{ width: 72 }} />
        <col style={{ width: 84 }} />
        <col />
        <col style={{ width: 64 }} />
      </colgroup>
      {head ? (
        <thead>
          <tr>
            <th>{t("route.th.dep")}</th>
            <th>{t("route.th.train")}</th>
            <th />
            <th className="r">{t("route.th.late")}</th>
          </tr>
        </thead>
      ) : null}
      <tbody>
        <TrainRows rows={rows} lang={lang} slugs={slugs} />
      </tbody>
    </table>
  );
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
  const shareText = t("route.shareText", { from: r.from, to: r.to, pct: fmtShare1(r.late, lang), pct6: fmtShare1(r.late6, lang), span });
  const shown = r.list.slice(0, SHOWN);
  const rest = r.list.slice(SHOWN);
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

  const bt = r.bestTrain;
  const wt = r.worstTrain;
  const showPicks = bt && wt && bt[0] + bt[1] !== wt[0] + wt[1];

  const main = (
    <div className="main">
      <h1 className="h1">
        <RouteName from={r.from} to={r.to} word={t("route.to")} />
      </h1>
      <p className="lead" style={{ marginTop: 8, fontSize: 16 }}>
        {t("route.sub", { n: fmtInt(r.trains, lang), dur: fmtDuration(r.minutes, lang) })}
        {r.rank !== null ? ` ${t("route.rankLine", { n: r.rank, total: all.leagueSize })}` : ""}
      </p>

      <Figure
        pct={r.late}
        pct6={r.late6}
        lang={lang}
        sentence={<Rich text={t("route.figure", { to: r.to })} />}
        basis={t("home.networkBasis", { trips: fmtInt(r.trips, lang), span })}
      />

      <dl className={comp ? "facts three" : "facts"}>
        <div>
          <dt>{t("route.avgTile")}</dt>
          <dd>
            {fmt1(r.avg, lang)} {t("unit.min")}
            <small>{t("route.avgOn", { to: r.to })}</small>
          </dd>
        </div>
        <div>
          <dt>{t("route.cancTile")}</dt>
          <dd>
            {fmtShare1(r.canc, lang)}
            <small>{t("route.cancNote", { n: fmtInt(r.runs, lang) })}</small>
          </dd>
        </div>
        {comp && comp[1] !== null ? (
          <div>
            <dt>{t("route.hourTile")}</dt>
            <dd>
              {fmtShare1(comp[1], lang)}
              <small>
                <Link href={route(lang, "compensation")} className="tl" prefetch={false}>
                  {t("route.hourLink")}
                </Link>
              </small>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="actions">
        <ShareButton lang={lang} title={`${r.from} → ${r.to} · German Punctuality`} text={shareText} url={url} label={t("route.share")} image={routeImagePath(w.lastMonth, `${r.slug}-portrait`, lang)} filename={r.slug} />
        {reverse ? (
          <Link href={route(lang, "route", reverse.slug)} className="tl" prefetch={false}>
            {t("route.revLabel")}: <RouteName from={reverse.from} to={reverse.to} word={t("route.to")} />, {fmtShare(reverse.late, lang)}
          </Link>
        ) : null}
      </div>

      <LiveBoard from={r.from} to={r.to} lang={lang} />

      <NearTime rows={nearRows} from={r.from} lang={lang} />

      <section className="sec" aria-labelledby="own">
        <h2 id="own">{t("route.ownTitle")}</h2>
        <Search lang={lang} variant="inline" />
        <Link href={`${route(lang, "change")}?s=${encodeURIComponent(r.to)}#typical`} className="tl" prefetch={false}>
          {t("route.changes", { to: r.to })} <Arrow />
        </Link>
      </section>
    </div>
  );

  return (
    <main id="main" className="container page">
      <Link href={route(lang, "routes")} className="back" prefetch={false}>
        <Arrow back /> {t("route.back")}
      </Link>

      <div className="two-col">
        {main}
        <div className="aside">
          {pts.length > 0 && r.curve ? (
            <section className="sec" aria-labelledby="curve">
              <h2 id="curve">{jump ? t("route.curve.jump", { from: jump.from, to: jump.to }) : t("route.curve.default")}</h2>
              <p className="sec-sub">{t("route.curve.sub", { train: r.curve.train })}</p>
              <StopLine
                points={pts.map((p) => ({ name: p[0], value: p[1] }))}
                lang={lang}
                unit="pct"
                xmax={xmax}
                jump={jump?.i ?? null}
                label={t("route.curve.aria", { train: r.curve.train, list: pts.map((p) => `${p[0]} ${fmtShare1(p[1], lang)}`).join(", ") })}
              />
            </section>
          ) : null}
        </div>
      </div>

      <div className="two-col wide">
        <div className="main">
          <section className="sec" aria-labelledby="trains">
            <h2 id="trains">{t("route.trains.title", { n: r.list.length })}</h2>
            <p className="sec-sub">{t("route.trains.sub", { from: r.from, to: r.to })}</p>
            {showPicks && bt && wt ? (
              <p className="picks">
                <Rich text={t("route.picks.line", { best: `${bt[0]} ${bt[1]}`, bp: fmtShare1(bt[2], lang), worst: `${wt[0]} ${wt[1]}`, wp: fmtShare1(wt[2], lang) })} />
              </p>
            ) : null}
            <TrainTable rows={shown} lang={lang} slugs={slugs} head />
            {rest.length > 0 ? (
              <details className="disc">
                <summary>{t("route.trains.more", { n: r.list.length })}</summary>
                <TrainTable rows={rest} lang={lang} slugs={slugs} />
              </details>
            ) : null}
          </section>
        </div>
        <div className="aside">
          {others.length > 0 ? (
            <section className="sec" aria-labelledby="more-routes">
              <h2 id="more-routes">{t("route.more", { from: r.from })}</h2>
              <table className="bt">
                <colgroup>
                  <col />
                  <col style={{ width: 64 }} />
                  <col style={{ width: 52 }} />
                </colgroup>
                <tbody>
                  {others.map((o) => (
                    <tr key={o.slug} className="tap">
                      <td className="two">
                        <Link href={route(lang, "route", o.slug)} prefetch={false}>
                          <b>
                            <RouteName from={o.from} to={o.to} word={t("route.to")} />
                          </b>
                          <span>{t("home.top.trips", { n: fmtInt(o.trips, lang) })}</span>
                        </Link>
                      </td>
                      <td className="bar">
                        <span>
                          <i style={{ width: `${o.late}%`, background: lateShareColor(o.late) }} />
                        </span>
                      </td>
                      <td className="v">{fmtShare(o.late, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Link href={route(lang, "routes")} className="more" prefetch={false}>
                {t("route.rankings")} <Arrow />
              </Link>
            </section>
          ) : null}
          <p className="note" style={{ marginTop: 24 }}>
            {t("route.method", { from: r.from, to: r.to, measured: fmtInt(r.trips, lang), runs: fmtInt(r.runs, lang), unlisted: fmtInt(r.unlisted, lang), span })}
          </p>
        </div>
      </div>
    </main>
  );
}
