import type { Metadata } from "next";
import type { TrainSummary } from "./types";
import { getStats } from "./data";
import { fmtInt, fmtMin, fmtPct, monthLabel } from "./format";
import { OG_SIZE, SITE_NAME, absoluteUrl, ogImagePath } from "./site";

const TAGLINE = "Your connection is not guaranteed.";

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
  const title = `Deutsche Bahn's most delayed trains, ${span}`;
  return pageMetadata({
    title: { absolute: `${title} | ${SITE_NAME}` },
    socialTitle: title,
    description:
      `${top.train} (${routeOf(top)}) runs ${fmtMin(top.minutes.avg)} minutes late on average at its last German stop. ` +
      `Every DB long-distance train ranked by delay, from ${fmtInt(s.overall.measuredRuns)} measured runs. ${TAGLINE}`,
    path: "/",
    image: "home",
    imageAlt: `${top.train}, Deutsche Bahn's most delayed long-distance train ${span}: ${fmtMin(top.minutes.avg)} minutes late on average.`,
  });
}

export function trainMetadata(t: TrainSummary): Metadata {
  const title = `${t.train}: ${fmtMin(t.minutes.avg)} min late on average`;
  const rank =
    t.rank.minutes != null
      ? `#${t.rank.minutes} most delayed DB long-distance train. `
      : t.rank.percent != null
        ? `#${t.rank.percent} most delayed DB long-distance train relative to journey time. `
        : "";
  return pageMetadata({
    title,
    socialTitle: title,
    description:
      `${rank}${t.train} (${routeOf(t)}) arrives ${fmtMin(t.minutes.avg)} min late on average at its last German stop, ` +
      `${fmtPct(t.percent.avg)} on its scheduled journey time. ${fmtInt(t.measured)} runs measured, ${windowSpan()}.`,
    path: `/train/${t.slug}/`,
    image: t.slug,
    imageAlt: `${t.train}, ${routeOf(t)}: ${fmtMin(t.minutes.avg)} minutes late on average, ${fmtPct(t.percent.avg)} of the scheduled journey time.`,
  });
}
