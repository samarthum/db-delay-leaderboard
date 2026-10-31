import { route, type Lang } from "@/lib/i18n";
import type { Key } from "@/lib/t";

export interface NavItem {
  key: "home" | "change" | "ranking" | "more" | "network" | "recap" | "method" | "compensation";
  label: Key;
  href: (lang: Lang) => string;
  /** Address prefixes (without language) where this item counts as the current place. */
  match: string[];
  /** Icon on the phone tab bar. */
  icon?: "search" | "change" | "ranking" | "network";
}

const at = (key: Parameters<typeof route>[1]) => (l: Lang) => route(l, key);

/** The four places on a phone: each one a real page with its own icon. Everything else sits in the footer links below. */
export const TABS: NavItem[] = [
  { key: "home", label: "nav.search", href: at("home"), match: ["", "route", "train", "line"], icon: "search" },
  { key: "change", label: "nav.change", href: at("change"), match: ["change"], icon: "change" },
  { key: "ranking", label: "nav.ranking", href: at("ranking"), match: ["routes", "ranking"], icon: "ranking" },
  { key: "network", label: "nav.network", href: at("network"), match: ["network"], icon: "network" },
];

/** The remaining pages, as a quiet row of links at the bottom of every page on phones. */
export const FOOTER_LINKS: NavItem[] = [
  { key: "recap", label: "nav.recap", href: at("recap"), match: ["recap"] },
  { key: "compensation", label: "nav.compensation", href: at("compensation"), match: ["compensation"] },
  { key: "method", label: "nav.method", href: at("method"), match: ["method"] },
];

/** The same places in the header on wide screens, with the footer pages listed after them. */
export const DESKTOP: NavItem[] = [TABS[0], TABS[1], TABS[2], ...TABS.slice(3), ...FOOTER_LINKS];

/** First path segment of the page in either language: "/de/zug/ice-1541/" -> "zug", "/" -> "". */
function firstSegment(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts[0] === "de" ? (parts[1] ?? "") : (parts[0] ?? "");
}

const GERMAN: Record<string, string> = {
  strecke: "route",
  strecken: "routes",
  zug: "train",
  linie: "line",
  netz: "network",
  methode: "method",
  rueckblick: "recap",
  umsteigen: "change",
  mehr: "more",
  entschaedigung: "compensation",
};

/** Is this item where the visitor is? Route, train and line pages count as Search: that is where you look things up. */
export function isActive(item: NavItem, pathname: string): boolean {
  const seg = firstSegment(pathname);
  return item.match.includes(GERMAN[seg] ?? seg);
}
