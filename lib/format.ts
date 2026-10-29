import type { Lang } from "./i18n";

/**
 * Number and date formatting that follows the page language and never depends on the runtime locale,
 * so the server render and the browser agree. German uses a decimal comma and a dot as thousands sign.
 * Every function defaults to English, so call sites that have no language yet keep working.
 */

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  // German short months: a dot after every abbreviation; May, June and July are written out.
  de: ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."],
};
const MONTHS_LONG: Record<Lang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
};

const NBSP = "\u00a0";

/** "2026-01" -> "Jan" */
export function monthShort(month: string, lang: Lang = "en"): string {
  return MONTHS[lang][Number(month.slice(5, 7)) - 1];
}

/** "2026-01" -> "Jan 2026" */
export function monthLabel(month: string, lang: Lang = "en"): string {
  return `${monthShort(month, lang)} ${month.slice(0, 4)}`;
}

/** "2026-01" -> "January 2026" / "Januar 2026" */
export function monthLong(month: string, lang: Lang = "en"): string {
  return `${MONTHS_LONG[lang][Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

/** "Nov 2025 to Sep 2026" / "Nov 2025 bis Sep 2026" */
export function spanLabel(first: string, last: string, lang: Lang = "en"): string {
  return `${monthLabel(first, lang)} ${lang === "de" ? "bis" : "to"} ${monthLabel(last, lang)}`;
}

const decimal = (lang: Lang) => (lang === "de" ? "," : ".");

/** 33396 -> "33,396" / "33.396" */
export function fmtInt(n: number, lang: Lang = "en"): string {
  const grouped = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, lang === "de" ? "." : ",");
  return n < 0 ? `−${grouped}` : grouped;
}

/** Whole minutes for headlines: 64.1 -> "64" */
export function fmtMin(n: number): string {
  return String(Math.round(n));
}

/** One decimal: 64.14 -> "64.1" / "64,1" */
export function fmt1(n: number, lang: Lang = "en"): string {
  return n.toFixed(1).replace(".", decimal(lang));
}

/** Unit sign for percent: "%" in English, "\u00a0%" in German. */
export function pctSign(lang: Lang = "en"): string {
  return lang === "de" ? `${NBSP}%` : "%";
}

/** A share in percent with one decimal: "34.3%" / "34,3 %" */
export function fmtShare1(n: number, lang: Lang = "en"): string {
  return `${fmt1(n, lang)}${pctSign(lang)}`;
}

/** A share in percent, whole number, one decimal below 1%: "34%" / "34 %", "0.4%" */
export function fmtShare(n: number, lang: Lang = "en"): string {
  const v = n < 1 && n > 0 ? fmt1(n, lang) : String(Math.round(n));
  return `${v}${pctSign(lang)}`;
}

/** "+18%" style relative delay */
export function fmtPct(n: number, lang: Lang = "en"): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : "−"}${Math.abs(r)}${pctSign(lang)}`;
}

/** -1.6 -> "−1.6", 4.2 -> "4.2" (typographic minus so it lines up with tabular figures) */
export function fmtSigned1(n: number, lang: Lang = "en"): string {
  return n < 0 ? `−${fmt1(Math.abs(n), lang)}` : fmt1(n, lang);
}

/** Whole numbers stay whole (50 -> "50"), others get one decimal (144.3), negatives a typographic minus. */
export function fmtStat(n: number, lang: Lang = "en"): string {
  return Number.isInteger(n) ? String(n).replace("-", "−") : fmtSigned1(n, lang);
}

/** 488.7 -> "8 h 9 min", 42 -> "42 min" */
export function fmtDuration(minutes: number, lang: Lang = "en"): string {
  const m = Math.round(minutes);
  const [h1, m1] = lang === "de" ? ["Std.", "Min."] : ["h", "min"];
  if (m < 60) return `${m}${NBSP}${m1}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}${NBSP}${h1} ${rest}${NBSP}${m1}` : `${h}${NBSP}${h1}`;
}

const DE_COUNT = ["", "ein", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
const DE_ORD = ["", "", "zweite", "dritte", "vierte", "fünfte", "sechste", "siebte", "achte", "neunte", "zehnte"];

/** A plain fraction of trips as words: "1 in 3 trips" / "jede dritte Fahrt", "3 in 4 trips" / "drei von vier Fahrten". */
export function fractionText(n: number, d: number, lang: Lang = "en"): string {
  if (lang === "en") return `${n} in ${d} trips`;
  if (n === 1) return d === 2 ? "jede zweite Fahrt" : `jede ${DE_ORD[d]} Fahrt`;
  return `${DE_COUNT[n]} von ${DE_COUNT[d]} Fahrten`;
}

/** "2026-06-27" -> "27 Jun 2026" / "27. Jun 2026" without touching the runtime time zone */
export function fmtDate(iso: string, lang: Lang = "en"): string {
  const [y, mo, d] = iso.slice(0, 10).split("-");
  const m = monthShort(`${y}-${mo}`, lang);
  return lang === "de" ? `${Number(d)}.${NBSP}${m} ${y}` : `${Number(d)} ${m} ${y}`;
}

/**
 * A share of trips as a plain fraction, for the headline sentence: 75.3 -> [3, 4], 34.3 -> [1, 3].
 * null when no fraction with a denominator up to 10 is within 2.5 points, or the share is tiny or near-total.
 */
export function simpleFraction(percent: number): [number, number] | null {
  const p = percent / 100;
  if (p < 0.08 || p > 0.92) return null;
  let best: [number, number] | null = null;
  let err = 0.025;
  for (let d = 2; d <= 10; d++) {
    for (let n = 1; n < d; n++) {
      const e = Math.abs(n / d - p);
      if (e < err - 1e-9) {
        err = e;
        best = [n, d];
      }
    }
  }
  if (!best) return null;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const k = gcd(best[0], best[1]);
  return [best[0] / k, best[1] / k];
}
