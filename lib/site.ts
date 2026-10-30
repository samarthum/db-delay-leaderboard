import type { Category } from "./types";
import { route, type Lang } from "./i18n";

/** The one place the public origin lives. Set NEXT_PUBLIC_SITE_URL at build time to switch domains. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://german-punctuality.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "German Punctuality";

export const REPO_URL = "https://github.com/samarthum/db-delay-leaderboard";
export const DATA_SOURCE_URL = "https://github.com/piebro/deutsche-bahn-data";

/** "/train/ice-1541/" or "/de/linie/re-19-duesseldorf-hbf-arnhem-centraal/" */
export function unitHref(u: { category: Category; slug: string }, lang: Lang = "en"): string {
  return route(lang, u.category === "longDistance" ? "train" : "line", u.slug);
}

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** OG images are generated at build time: public/og/<lastMonth>/<name>.png, German ones under .../de/. */
export function ogImagePath(lastMonth: string, name: string, lang: Lang = "en"): string {
  return lang === "de" ? `/og/${lastMonth}/de/${name}.png` : `/og/${lastMonth}/${name}.png`;
}

/** The picture that goes out when someone shares: portrait 1080x1350 (phone feeds, X, Instagram). The wide 1200x630 one is only the link preview. */
export function portraitPath(lastMonth: string, slug: string, lang: Lang = "en"): string {
  return ogImagePath(lastMonth, `${slug}-portrait`, lang);
}

/** Route pictures are built at deploy time too: public/og/routes/<lastMonth>/[de/]<name>.png (wide) and <name>-portrait.png. */
export function routeImagePath(lastMonth: string, name: string, lang: Lang = "en"): string {
  return `/og/routes/${lastMonth}/${lang === "de" ? "de/" : ""}${name}.png`;
}

export const OG_SIZE = { width: 1200, height: 630 } as const;
