import type { Metadata } from "next";
import type { UnitSummary } from "./types";
import { getStats } from "./data";
import { fmt1, fmtInt, fmtMin, fmtPct, fmtShare1, spanLabel } from "./format";
import { OG_LOCALE, otherLangPath, route, type Lang } from "./i18n";
import { OG_SIZE, SITE_NAME, absoluteUrl, ogImagePath, unitHref } from "./site";
import { makeT } from "./t";

function windowSpan(lang: Lang): string {
  const w = getStats().window;
  return spanLabel(w.firstMonth, w.lastMonth, lang);
}

function routeOf(t: UnitSummary): string {
  return `${t.origin} ${t.category === "longDistance" ? "→" : "↔"} ${t.dest}`;
}

/** "No. 3 of Germany's most delayed regional lines." or "" when unranked. */
export function rankSentence(t: UnitSummary, lang: Lang = "en"): string {
  const tr = makeT(lang);
  const ld = t.category === "longDistance";
  if (t.rank.minutes === 1) return tr("seo.rank.first", { what: tr(ld ? "seo.what.longDistance" : "seo.what.regional") });
  const plural = tr(ld ? "seo.what.longDistancePlural" : "seo.what.regionalPlural");
  if (t.rank.minutes !== null) return tr("seo.rank.nth", { n: t.rank.minutes, what: plural });
  if (t.rank.percent !== null) return tr("seo.rank.pct", { n: t.rank.percent, what: plural });
  return "";
}

function pageMetadata(p: {
  lang: Lang;
  title: Metadata["title"];
  socialTitle: string;
  description: string;
  path: string;
  image: string;
  imageAlt: string;
}): Metadata {
  const url = absoluteUrl(p.path);
  const other = otherLangPath(p.path);
  const en = p.lang === "en" ? p.path : other.path;
  const de = p.lang === "de" ? p.path : other.path;
  const image = {
    url: absoluteUrl(ogImagePath(getStats().window.lastMonth, p.image, p.lang)),
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    alt: p.imageAlt,
  };
  return {
    title: p.title,
    description: p.description,
    alternates: {
      canonical: url,
      languages: { en: absoluteUrl(en), de: absoluteUrl(de), "x-default": absoluteUrl(en) },
    },
    openGraph: {
      title: p.socialTitle,
      description: p.description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: OG_LOCALE[p.lang],
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.socialTitle,
      description: p.description,
      images: [image.url],
    },
  };
}

/** The 15-minute share of the whole window, the number the home page opens with. */
export function networkLate(): { pct: number; trips: number } {
  const ld = getStats().recap.longDistance;
  return { pct: ld.latePct, trips: ld.measured };
}

export function homeMetadata(lang: Lang): Metadata {
  const t = makeT(lang);
  const { pct, trips } = networkLate();
  const title = t("seo.home.title");
  return pageMetadata({
    lang,
    title: { absolute: title },
    socialTitle: title,
    description: t("seo.home.desc", { pct: fmtShare1(pct, lang), trips: fmtInt(trips, lang), span: windowSpan(lang) }),
    path: route(lang, "home"),
    image: "home",
    imageAlt: t("seo.home.alt", { pct: fmtShare1(pct, lang), span: windowSpan(lang) }),
  });
}

export function rankingMetadata(lang: Lang): Metadata {
  const t = makeT(lang);
  const title = t("seo.ranking.title");
  return pageMetadata({
    lang,
    title,
    socialTitle: title,
    description: t("seo.ranking.desc", { span: windowSpan(lang) }),
    path: route(lang, "ranking"),
    image: "home",
    imageAlt: t("seo.home.alt", { pct: fmtShare1(networkLate().pct, lang), span: windowSpan(lang) }),
  });
}

export function networkMetadata(lang: Lang, stationCount: number): Metadata {
  const t = makeT(lang);
  const title = t("seo.network.title");
  return pageMetadata({
    lang,
    title,
    socialTitle: title,
    description: t("seo.network.desc", { n: fmtInt(stationCount, lang), span: windowSpan(lang) }),
    path: route(lang, "network"),
    image: "home",
    imageAlt: t("seo.home.alt", { pct: fmtShare1(networkLate().pct, lang), span: windowSpan(lang) }),
  });
}

export function methodMetadata(lang: Lang): Metadata {
  const t = makeT(lang);
  const title = t("seo.method.title");
  return pageMetadata({
    lang,
    title,
    socialTitle: title,
    description: t("seo.method.desc"),
    path: route(lang, "method"),
    image: "home",
    imageAlt: t("seo.home.alt", { pct: fmtShare1(networkLate().pct, lang), span: windowSpan(lang) }),
  });
}

export function unitMetadata(u: UnitSummary & { histogram?: { lo: number | null; share: number }[] }, lang: Lang, latePct: number): Metadata {
  const t = makeT(lang);
  const rank = rankSentence(u, lang);
  const title = t("seo.unit.title", { name: u.name, pct: fmtShare1(latePct, lang) });
  return pageMetadata({
    lang,
    title,
    socialTitle: title,
    description: t("seo.unit.desc", {
      rank: rank ? `${rank} ` : "",
      name: u.name,
      route: routeOf(u),
      avg: fmt1(u.minutes.avg, lang),
      rel: fmtPct(u.percent.avg, lang),
      span: windowSpan(lang),
      n: fmtInt(u.measured, lang),
    }),
    path: unitHref(u, lang),
    image: u.slug,
    imageAlt: t("seo.unit.alt", { name: u.name, route: routeOf(u), avg: fmtMin(u.minutes.avg), rel: fmtPct(u.percent.avg, lang) }),
  });
}

export function recapMetadata(lang: Lang): Metadata {
  const t = makeT(lang);
  const { recap, window: w } = getStats();
  const ld = recap.longDistance;
  const span = spanLabel(w.firstMonth, w.lastMonth, lang);
  const title = t("seo.recap.title", { span });
  return pageMetadata({
    lang,
    title,
    socialTitle: title,
    description: t("seo.recap.desc", {
      avg: fmt1(ld.avgDelayMin, lang),
      late: fmtShare1(ld.latePct, lang),
      late60: fmtShare1(ld.late60Pct, lang),
      canc: fmtShare1(ld.cancelledPct, lang),
      n: fmtInt(ld.measured, lang),
      span,
    }),
    path: route(lang, "recap"),
    image: "recap",
    imageAlt: t("seo.recap.alt", { span, avg: fmt1(ld.avgDelayMin, lang), late: fmtShare1(ld.latePct, lang) }),
  });
}
