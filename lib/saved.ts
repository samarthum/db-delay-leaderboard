import type { Lang } from "./i18n";

/** A train or route the visitor starred. Kept on this device only (localStorage); no account. */
export interface Saved {
  kind: "train" | "route";
  href: string;
  title: string;
  sub: string;
  /** Average minutes late, as the page showed it when saved. */
  avg: number;
  /** "ICE 1541" for trains that have a live lookup. */
  live?: string;
}

const KEY = "gp-saved-v1";
const MAX = 8;
const EVENT = "gp:saved";

function all(): Record<Lang, Saved[]> {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return { en: Array.isArray(v.en) ? v.en : [], de: Array.isArray(v.de) ? v.de : [] };
  } catch {
    return { en: [], de: [] };
  }
}

export function readSaved(lang: Lang): Saved[] {
  if (typeof window === "undefined") return [];
  return all()[lang];
}

export function isSaved(lang: Lang, href: string): boolean {
  return readSaved(lang).some((s) => s.href === href);
}

export function toggleSaved(lang: Lang, item: Saved): boolean {
  const a = all();
  const on = a[lang].some((s) => s.href === item.href);
  a[lang] = on ? a[lang].filter((s) => s.href !== item.href) : [item, ...a[lang]].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // private mode: nothing kept
  }
  window.dispatchEvent(new Event(EVENT));
  return !on;
}

export function onSavedChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
