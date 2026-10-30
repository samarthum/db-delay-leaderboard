import { route, type Lang, type RouteKey } from "@/lib/i18n";
import type { Key } from "@/lib/t";

export interface NavItem {
  key: Exclude<RouteKey, "train" | "line" | "recap" | "routes" | "route">;
  label: Key;
  href: (lang: Lang) => string;
}

export const NAV: NavItem[] = [
  { key: "home", label: "nav.search", href: (l) => route(l, "home") },
  { key: "ranking", label: "nav.ranking", href: (l) => route(l, "ranking") },
  { key: "network", label: "nav.network", href: (l) => route(l, "network") },
  { key: "method", label: "nav.method", href: (l) => route(l, "method") },
];

/** Is this nav item the current page? Home matches only "/" and "/de/"; the rest match their folder. */
export function isActive(item: NavItem, lang: Lang, pathname: string): boolean {
  const href = item.href(lang);
  const p = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return item.key === "home" ? p === href : p.startsWith(href);
}
