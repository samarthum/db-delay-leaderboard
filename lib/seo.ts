import type { Metadata } from "next";
import type { UnitSummary } from "./types";
import { getStats } from "./data";
import { fmt1, fmtInt, fmtMin, fmtPct, monthLabel } from "./format";
import { OG_SIZE, SITE_NAME, absoluteUrl, ogImagePath, unitHref } from "./site";

function windowSpan(): string {
  const w = getStats().window;
  return `${monthLabel(w.firstMonth)} – ${monthLabel(w.lastMonth)}`;
}

function routeOf(t: UnitSummary): string {
  return `${t.origin} ${t.category === "longDistance" ? "→" : "↔"} ${t.dest}`;
}

/** "No. 3 of Germany's most delayed regional lines." or "" when unranked. */
export function rankSentence(t: UnitSummary): string {
  const what = t.category === "longDistance" ? "long-distance trains" : "regional lines";
  if (t.rank.minutes === 1) return `Germany's most delayed ${what.replace(/s$/, "")}.`;
  if (t.rank.minutes !== null) return `No. ${t.rank.minutes} of Germany's most delayed ${what}.`;
  if (t.rank.percent !== null) return `No. ${t.rank.percent} of the ${what} for delay compared to trip length.`;
  return "";
}

function pageMetadata(p: {
  title: Metadata["title"];
  socialTitle: string;
  description: string;
  path: string;
  image: string;
  imageAlt: string;
}): Metadata {
  const url = absoluteUrl(p.path);
  const image = {
    url: absoluteUrl(ogImagePath(getStats().window.lastMonth, p.image)),
    width: OG_SIZE.width,
    height: OG_SIZE.height,
    alt: p.imageAlt,
  };
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: url },
    openGraph: {
      title: p.socialTitle,
      description: p.description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_GB",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.socialTitle,
      description: p.description,
      images: [image],
    },
  };
}

export function homeMetadata(): Metadata {
  const { months, categories } = getStats().headline;
  const ld = categories.longDistance;
  const reg = categories.regional;
  const span = `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`;
  const title = `${SITE_NAME}: how late Deutsche Bahn trains are`;
  return pageMetadata({
    title: { absolute: title },
    socialTitle: title,
    description:
      `The average long-distance train in Germany arrives ${fmtMin(ld.avgDelayMin)} minutes late. ` +
      `Regional trains: ${fmt1(reg.avgDelayMin)} minutes. ${span}, ${fmtInt(ld.measured + reg.measured)} trips. ` +
      `The most delayed trains and lines, ranked.`,
    path: "/",
    image: "home",
    imageAlt: `The average long-distance train in Germany arrives ${fmtMin(ld.avgDelayMin)} minutes late, ${span}.`,
  });
}

export function unitMetadata(t: UnitSummary): Metadata {
  const title = `${t.name}: ${fmtMin(t.minutes.avg)} min late on average`;
  const rank = rankSentence(t);
  return pageMetadata({
    title,
    socialTitle: title,
    description:
      `${rank ? `${rank} ` : ""}${t.name} (${routeOf(t)}) is ${fmtMin(t.minutes.avg)} min late on average, ` +
      `${fmtPct(t.percent.avg)} of the trip time. ${windowSpan()}, ${fmtInt(t.measured)} trips.`,
    path: unitHref(t),
    image: t.slug,
    imageAlt: `${t.name}, ${routeOf(t)}: ${fmtMin(t.minutes.avg)} minutes late on average, ${fmtPct(t.percent.avg)} of the trip time.`,
  });
}

export function recapMetadata(): Metadata {
  const { recap, window: w } = getStats();
  const ld = recap.longDistance;
  const span = `${monthLabel(w.firstMonth)} to ${monthLabel(w.lastMonth)}`;
  const title = `Long-distance trains in Germany, ${span}`;
  return pageMetadata({
    title,
    socialTitle: title,
    description:
      `The average long-distance train arrived ${fmt1(ld.avgDelayMin)} minutes late. ${fmt1(ld.latePct)}% were 15 minutes or more late, ` +
      `${fmt1(ld.late60Pct)}% an hour or more, ${fmt1(ld.cancelledPct)}% cancelled. ${fmtInt(ld.measured)} trips, ${span}.`,
    path: "/recap/",
    image: "recap",
    imageAlt: `Long-distance trains in Germany, ${span}: ${fmt1(ld.avgDelayMin)} minutes late on average, ${fmt1(ld.latePct)}% 15 minutes or more late.`,
  });
}
