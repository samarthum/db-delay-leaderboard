import type { Lang } from "./i18n";

/** A page the visitor looked at, kept on this device only (localStorage), newest first. */
export interface Recent {
  href: string;
  title: string;
  sub?: string;
  value?: string;
  /** "ICE 1541" for long-distance trains that have a live lookup (the home page shows today's run). */
  live?: string;
}

const KEY = "gp-recent-v1";
const MAX = 5;

function all(): Record<Lang, Recent[]> {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return { en: Array.isArray(v.en) ? v.en : [], de: Array.isArray(v.de) ? v.de : [] };
  } catch {
    return { en: [], de: [] };
  }
}

export function readRecent(lang: Lang): Recent[] {
  if (typeof window === "undefined") return [];
  return all()[lang].slice(0, MAX);
}

export function remember(lang: Lang, item: Recent) {
  try {
    const a = all();
    a[lang] = [item, ...a[lang].filter((r) => r.href !== item.href)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // private mode or storage full: nothing to remember
  }
}

/** "/" and "/de/" are the search page itself. */
export function isHome(pathname: string): boolean {
  return pathname === "/" || pathname === "/de" || pathname === "/de/";
}
