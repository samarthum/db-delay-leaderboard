import Link from "next/link";
import type { RouteEntry, RouteTrain } from "@/lib/types";
import { getReverseRoute, getRoutes, getStats, getUnitSlugs } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmt1, fmtDuration, fmtInt, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { clock } from "@/lib/routeSearch";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { LateLead } from "../LateLead";
import { RouteShare } from "../RouteShare";
import styles from "./RoutePage.module.css";

const FEW_SHOWN = 8;

function trainHref(t: RouteTrain, slugs: Set<string>, lang: Lang): string | null {
  const slug = `${t[0]}-${t[1]}`.toLowerCase();
  return slugs.has(slug) ? route(lang, "train", slug) : null;
}

/** Share of trips 15+ min late at each stop, as a list with bars: readable at 390 px, and every figure is text. */
function Curve({ r, lang }: { r: RouteEntry; lang: Lang }) {
  const t = makeT(lang);
  if (!r.curve) return null;
  const pts = r.curve.points;
  const top = Math.max(40, Math.ceil(Math.max(...pts.map((p) => p[1])) / 10) * 10);
  let jump: { from: string; to: string; d: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i][1] - pts[i - 1][1];
    if (d > 0 && (!jump || d > jump.d)) jump = { from: pts[i - 1][0], to: pts[i][0], d };
  }
  return (
    <section className={styles.section} aria-labelledby="curve">
      <h2 id="curve" className={styles.h2}>
        {jump ? t("route.curve.jump", { from: jump.from, to: jump.to }) : t("route.curve.default")}
      </h2>
      <p className={styles.sub}>{t("route.curve.sub", { train: r.curve.train })}</p>
      <ol className={styles.curve}>
        {pts.map(([name, pct]) => (
          <li key={name} className={styles.stop}>
            <span className={styles.stopName}>{name}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${Math.max(2, Math.round((pct / top) * 100))}%`, background: lateShareColor(pct) }} />
            </span>
            <span className={styles.stopPct}>{fmtShare1(pct, lang)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrainRow({ t: tr, lang, slugs }: { t: RouteTrain; lang: Lang; slugs: Set<string> }) {
  const t = makeT(lang);
  const href = trainHref(tr, slugs, lang);
  const name = `${tr[0]} ${tr[1]}`;
  const body = (
    <>
      <span className={styles.trainName}>{name}</span>
      <span className={styles.trainTimes}>
        {clock(tr[2])} → {clock(tr[3])}
      </span>
      {tr[4] === null ? (
        <span className={styles.trainFew}>{t("route.trains.few")}</span>
      ) : (
        <span className={styles.trainPct} style={{ color: lateShareColor(tr[4]) }}>
          {fmtShare1(tr[4], lang)}
        </span>
      )}
    </>
  );
  return <li className={styles.train}>{href ? <Link href={href} prefetch={false}>{body}</Link> : <div>{body}</div>}</li>;
}

export function RoutePage({ r, lang }: { r: RouteEntry; lang: Lang }) {
  const t = makeT(lang);
  const stats = getStats();
  const w = stats.window;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const all = getRoutes();
  const slugs = new Set(getUnitSlugs("longDistance"));
  const reverse = getReverseRoute(r);
  const others = all.routes.filter((x) => x.from === r.from && x.slug !== r.slug).sort((a, b) => b.trips - a.trips).slice(0, 4);
  const url = absoluteUrl(route(lang, "route", r.slug));
  const shareText = t("route.shareText", { from: r.from, to: r.to, pct: fmtShare1(r.late, lang), pct6: fmtShare1(r.late6, lang), span });
  const img = (suffix: string) => routeImagePath(w.lastMonth, `${r.slug}${suffix}`, lang);
  const shown = r.list.slice(0, FEW_SHOWN);
  const rest = r.list.slice(FEW_SHOWN);

  return (
    <main id="main" className={styles.page}>
      <div className="container">
        <Link href={route(lang, "routes")} className={styles.back} prefetch={false}>
          <span aria-hidden="true">←</span> {t("route.back")}
        </Link>

        <header className={`board ${styles.board}`}>
          <p className={styles.kicker}>
            <span className={styles.chip}>{t("route.kicker")}</span>
            {r.rank !== null ? <span className={styles.rankChip}>{t("route.rank", { n: r.rank, total: all.leagueSize })}</span> : null}
          </p>
          <h1 className={styles.title}>
            {r.from}
            <span className={styles.arrow} aria-hidden="true">
              {" → "}
            </span>
            <span className="visually-hidden"> {t("route.to")} </span>
            {r.to}
          </h1>
          <p className={styles.route}>{t("route.sub", { n: fmtInt(r.trains, lang), dur: fmtDuration(r.minutes, lang) })}</p>

          <div className={styles.lead}>
            <LateLead pct={r.late} lang={lang} basis={t("home.networkBasis", { trips: fmtInt(r.trips, lang), span })} />
            <p className={styles.db6}>{t("route.db6", { pct: fmtShare1(r.late6, lang) })}</p>
          </div>

          <dl className={styles.tiles}>
            <div className={styles.tile}>
              <dt>{t("route.avgTile")}</dt>
              <dd>{fmt1(r.avg, lang)}</dd>
              <dd className={styles.tileNote}>{t("route.avgNote")}</dd>
            </div>
            <div className={styles.tile}>
              <dt>{t("route.cancTile")}</dt>
              <dd>{fmtShare1(r.canc, lang)}</dd>
              <dd className={styles.tileNote}>{t("route.cancNote", { n: fmtInt(r.runs, lang) })}</dd>
            </div>
          </dl>
        </header>

        <div className={styles.shareRow}>
          <RouteShare lang={lang} title={`${r.from} → ${r.to} · German Punctuality`} text={shareText} url={url} image={img("-portrait")} filename={r.slug} />
        </div>

        <Curve r={r} lang={lang} />

        {r.bestTrain && r.worstTrain && r.bestTrain[0] + r.bestTrain[1] !== r.worstTrain[0] + r.worstTrain[1] ? (
          <section className={styles.section} aria-labelledby="picks">
            <h2 id="picks" className={styles.h2}>
              {t("route.picks.title")}
            </h2>
            <div className={styles.picks}>
              {(
                [
                  ["route.picks.best", r.bestTrain],
                  ["route.picks.worst", r.worstTrain],
                ] as const
              ).map(([label, p]) => {
                const href = trainHref([p[0], p[1], 0, 0, p[2], p[3]], slugs, lang);
                const inner = (
                  <>
                    <span className={styles.pickLabel}>{t(label)}</span>
                    <span className={styles.pickName}>
                      {p[0]} {p[1]}
                    </span>
                    <span className={styles.pickPct} style={{ color: lateShareColor(p[2]) }}>
                      {t("route.picks.trips", { pct: fmtShare1(p[2], lang), to: r.to, n: fmtInt(p[3], lang) })}
                    </span>
                  </>
                );
                return href ? (
                  <Link key={label} href={href} className={styles.pick} prefetch={false}>
                    {inner}
                  </Link>
                ) : (
                  <div key={label} className={styles.pick}>
                    {inner}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className={styles.section} aria-labelledby="trains">
          <h2 id="trains" className={styles.h2}>
            {t("route.trains.title", { n: r.list.length })}
          </h2>
          <p className={styles.sub}>{t("route.trains.sub", { from: r.from, to: r.to })}</p>
          <ul className={styles.trains}>
            {shown.map((tr) => (
              <TrainRow key={`${tr[0]}${tr[1]}`} t={tr} lang={lang} slugs={slugs} />
            ))}
          </ul>
          {rest.length > 0 ? (
            <details className={styles.more}>
              <summary className={styles.moreSummary}>{t("route.trains.more", { n: r.list.length })}</summary>
              <ul className={styles.trains}>
                {rest.map((tr) => (
                  <TrainRow key={`${tr[0]}${tr[1]}`} t={tr} lang={lang} slugs={slugs} />
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className={styles.section} aria-labelledby="pictures">
          <h2 id="pictures" className={styles.h2}>
            {t("route.pictures")}
          </h2>
          <figure className={styles.figure}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img("-portrait")} width={1080} height={1350} alt={t("route.imgTall", { from: r.from, to: r.to })} className={styles.picture} loading="lazy" />
            <figcaption className={styles.captions}>
              <a href={img("-portrait")} download={`${r.slug}.png`}>
                {t("route.saveTall")}
              </a>
              <a href={img("")} download={`${r.slug}-wide.png`}>
                {t("route.saveWide")}
              </a>
            </figcaption>
          </figure>
        </section>

        <p className={styles.method}>
          {t("route.method", { from: r.from, to: r.to, measured: fmtInt(r.trips, lang), runs: fmtInt(r.runs, lang), span })}
        </p>

        <nav className={styles.links} aria-label={t("route.more", { from: r.from })}>
          {reverse ? (
            <Link href={route(lang, "route", reverse.slug)} className={styles.linkCard} prefetch={false}>
              {t("route.reverse", { from: r.from, to: r.to })}
              <span className={styles.linkPct} style={{ color: lateShareColor(reverse.late) }}>
                {fmtShare1(reverse.late, lang)}
              </span>
            </Link>
          ) : null}
          {others.map((o) => (
            <Link key={o.slug} href={route(lang, "route", o.slug)} className={styles.linkCard} prefetch={false}>
              {o.from} → {o.to}
              <span className={styles.linkPct} style={{ color: lateShareColor(o.late) }}>
                {fmtShare1(o.late, lang)}
              </span>
            </Link>
          ))}
          <Link href={route(lang, "home")} className={styles.linkCard} prefetch={false}>
            {t("route.search")} <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </div>
    </main>
  );
}
