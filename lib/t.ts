import { DE, EN, type Key } from "./dict";
import type { Lang } from "./i18n";

export type { Key };
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

/** "{name}" placeholders are replaced from `vars`; a placeholder with no value is left visible so it shows up in review. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function makeT(lang: Lang): T {
  const dict: Record<Key, string> = lang === "de" ? DE : EN;
  return (key, vars) => format(dict[key], vars);
}
