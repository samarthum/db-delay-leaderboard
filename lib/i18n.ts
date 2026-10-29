/**
 * Two languages, two URL trees: English at /, German under /de/. Each tree has its own root layout
 * (route groups in app/), so <html lang> is right on every page of a static export.
 */

export type Lang = "en" | "de";
export const LANGS: readonly Lang[] = ["en", "de"] as const;
export const DEFAULT_LANG: Lang = "en";

export type RouteKey = "home" | "ranking" | "network" | "method" | "recap" | "train" | "line";

/** URL segment of every page, per language. German pages get German addresses. */
const SEGMENT: Record<Lang, Record<RouteKey, string>> = {
  en: { home: "", ranking: "ranking", network: "network", method: "method", recap: "recap", train: "train", line: "line" },
  de: { home: "", ranking: "ranking", network: "netz", method: "methode", recap: "rueckblick", train: "zug", line: "linie" },
};

export function segment(lang: Lang, key: RouteKey): string {
  return SEGMENT[lang][key];
}

/** "/", "/de/", "/worst/", "/de/zug/ice-1541/" */
export function route(lang: Lang, key: RouteKey, slug?: string): string {
  const prefix = lang === "de" ? "/de" : "";
  const seg = SEGMENT[lang][key];
  const parts = [prefix, seg, slug].filter((p): p is string => Boolean(p));
  return parts.length === 0 ? "/" : `${parts.join("/")}/`;
}

export function langOfPath(pathname: string): Lang {
  return pathname === "/de" || pathname.startsWith("/de/") ? "de" : "en";
}

/** The same page in the other language: "/worst/" -> "/de/schlechteste/". Unknown paths go home. */
export function otherLangPath(pathname: string): { lang: Lang; path: string } {
  const from = langOfPath(pathname);
  const to: Lang = from === "en" ? "de" : "en";
  const rest = (from === "de" ? pathname.replace(/^\/de\/?/, "/") : pathname).split("/").filter(Boolean);
  const [seg, slug] = rest;
  if (!seg) return { lang: to, path: route(to, "home") };
  const key = (Object.keys(SEGMENT[from]) as RouteKey[]).find((k) => k !== "home" && SEGMENT[from][k] === seg);
  return { lang: to, path: key ? route(to, key, slug) : route(to, "home") };
}

/** BCP 47 tag for Intl and metadata. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", de: "de-DE" };
export const OG_LOCALE: Record<Lang, string> = { en: "en_GB", de: "de_DE" };
