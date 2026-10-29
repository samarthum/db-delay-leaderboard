import type { Metadata } from "next";
import type { TrainSummary } from "./types";
import { getStats } from "./data";
import { fmtInt, fmtMin, fmtPct, monthLabel } from "./format";
import { OG_SIZE, SITE_NAME, absoluteUrl, ogImagePath } from "./site";

function windowSpan(): string {
  const w = getStats().window;
  return `${monthLabel(w.firstMonth)} – ${monthLabel(w.lastMonth)}`;
}

function routeOf(t: TrainSummary): string {
  return `${t.origin} → ${t.dest}`;
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
  const s = getStats();
  const top = s.rankings.minutes[0];
  const span = windowSpan();
  const title = `${SITE_NAME}: Deutsche Bahn's most delayed trains`;
  return pageMetadata({
    title: { absolute: title },
    socialTitle: title,
    description:
      `${top.train} (${routeOf(top)}) is ${fmtMin(top.minutes.avg)} minutes late on average. ` +
      `Every Deutsche Bahn long-distance train, ranked by how late it arrives. ${span}, ${fmtInt(s.overall.measuredRuns)} trips.`,
    path: "/",
    image: "home",
    imageAlt: `${top.train}, Deutsche Bahn's most delayed long-distance train ${span}: ${fmtMin(top.minutes.avg)} minutes late on average.`,
  });
}

export function trainMetadata(t: TrainSummary): Metadata {
  const title = `${t.train}: ${fmtMin(t.minutes.avg)} min late on average`;
  const rank =
    t.rank.minutes != null
      ? `No. ${t.rank.minutes} of Germany's most delayed long-distance trains. `
      : t.rank.percent != null
        ? `No. ${t.rank.percent} for delay compared to trip length. `
        : "";
  return pageMetadata({
    title,
    socialTitle: title,
    description:
      `${rank}${t.train} (${routeOf(t)}) is ${fmtMin(t.minutes.avg)} min late on average, ` +
      `${fmtPct(t.percent.avg)} of the trip time. ${windowSpan()}, ${fmtInt(t.measured)} trips.`,
    path: `/train/${t.slug}/`,
    image: t.slug,
    imageAlt: `${t.train}, ${routeOf(t)}: ${fmtMin(t.minutes.avg)} minutes late on average, ${fmtPct(t.percent.avg)} of the trip time.`,
  });
}
