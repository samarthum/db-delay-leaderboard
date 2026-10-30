import Link from "next/link";
import type { RouteEntry } from "@/lib/types";
import { getRoutes } from "@/lib/data";
import { lateShareColor } from "@/lib/colors";
import { fmtInt, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { absoluteUrl, routeImagePath } from "@/lib/site";
import { makeT } from "@/lib/t";
import { ShareButton } from "../ShareButton";
import styles from "./RoutesPage.module.css";

function Row({ r, lang, n }: { r: RouteEntry; lang: Lang; n?: number }) {
  const t = makeT(lang);
  return (
    <li className={styles.row}>
      <Link href={route(lang, "route", r.slug)} prefetch={false}>
        {n !== undefined ? <span className={styles.n}>{n}</span> : null}
        <span className={styles.names}>
          {r.from}
          <span className={styles.arrow} aria-hidden="true">
            {" → "}
          </span>
          <span className="visually-hidden"> {t("route.to")} </span>
          {r.to}
          <span className={styles.trips}>{t("routes.trips", { n: fmtInt(r.trips, lang) })}</span>
        </span>
        <span className={styles.pct} style={{ color: lateShareColor(r.late) }}>
          {fmtShare1(r.late, lang)}
        </span>
      </Link>
    </li>
  );
}

/** The league of routes: the ones where trains are late most often, the ones closest to the timetable, and every page. */
export function RoutesPage({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const data = getRoutes();
  const span = spanLabel(data.window.firstMonth, data.window.lastMonth, lang);
  const league = data.routes.filter((r) => r.rank !== null).sort((a, b) => (a.rank as number) - (b.rank as number));
  const worst = league.slice(0, 10);
  const best = league.slice(-5).reverse();
  const all = [...data.routes].sort((a, b) => a.from.localeCompare(b.from, "de") || a.to.localeCompare(b.to, "de"));
  const pic = routeImagePath(data.window.lastMonth, "ranking-portrait", lang);
  const wide = routeImagePath(data.window.lastMonth, "ranking", lang);
  const top = worst[0];
  const bottom = best[0];
  const shareText = t("routes.shareText", {
    from: top.from,
    to: top.to,
    pct: fmtShare1(top.late, lang),
    bestFrom: bottom.from,
    bestTo: bottom.to,
    bestPct: fmtShare1(bottom.late, lang),
  });

  return (
    <main id="main" className={`container ${styles.page}`}>
      <h1 className={styles.title}>{t("routes.title")}</h1>
      <p className={styles.sub}>{t("routes.sub", { n: league.length, span })}</p>

      <section className={styles.section} aria-labelledby="worst">
        <h2 id="worst" className={styles.h2}>
          {t("routes.latest")}
        </h2>
        <p className={styles.sub}>{t("routes.latestSub", { n: league.length })}</p>
        <ol className={styles.list}>
          {worst.map((r) => (
            <Row key={r.slug} r={r} lang={lang} n={r.rank as number} />
          ))}
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="best">
        <h2 id="best" className={styles.h2}>
          {t("routes.best")}
        </h2>
        <p className={styles.sub}>{t("routes.bestSub")}</p>
        <ol className={styles.list}>
          {best.map((r) => (
            <Row key={r.slug} r={r} lang={lang} n={r.rank as number} />
          ))}
        </ol>
      </section>

      <div className={styles.share}>
        <ShareButton lang={lang} title={`${t("routes.title")} · German Punctuality`} text={shareText} url={absoluteUrl(route(lang, "routes"))} label={t("routes.share")} />
        <figure className={styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pic} width={1080} height={1350} alt={t("routes.img")} className={styles.picture} loading="lazy" />
          <figcaption className={styles.captions}>
            <a href={pic} download="german-punctuality-routes.png">
              {t("route.saveTall")}
            </a>
            <a href={wide} download="german-punctuality-routes-wide.png">
              {t("route.saveWide")}
            </a>
          </figcaption>
        </figure>
      </div>

      <section className={styles.section} aria-labelledby="all">
        <h2 id="all" className={styles.h2}>
          {t("routes.all", { n: all.length })}
        </h2>
        <p className={styles.sub}>{t("routes.allSub", { trips: fmtInt(data.params.minTrips, lang) })}</p>
        <details className={styles.more}>
          <summary className={styles.moreSummary}>{t("routes.all", { n: all.length })}</summary>
          <ul className={styles.list}>
            {all.map((r) => (
              <Row key={r.slug} r={r} lang={lang} />
            ))}
          </ul>
        </details>
      </section>

      <p className={styles.how}>{t("routes.how", { trips: fmtInt(data.params.minTrips, lang) })}</p>
      <Link href={route(lang, "home")} className={styles.search} prefetch={false}>
        {t("routes.search")} <span aria-hidden="true">→</span>
      </Link>
    </main>
  );
}
