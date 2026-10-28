import type { WindowInfo } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-01" -> "Jan" */
export function monthShort(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1];
}

/** "2026-01" -> "Jan 2026" */
export function monthLabel(month: string): string {
  return `${monthShort(month)} ${month.slice(0, 4)}`;
}

/** "Nov 2025 – Sep 2026 · 11 months" */
export function windowLabel(w: WindowInfo): string {
  return `${monthLabel(w.firstMonth)} – ${monthLabel(w.lastMonth)} · ${w.monthCount} months`;
}

/** 33396 -> "33,396" (fixed locale so server and client agree) */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** Whole minutes for headlines: 64.1 -> "64" */
export function fmtMin(n: number): string {
  return String(Math.round(n));
}

/** One decimal: 64.14 -> "64.1" */
export function fmt1(n: number): string {
  return n.toFixed(1);
}

/** "+18%" style relative delay */
export function fmtPct(n: number): string {
  const r = Math.round(n);
  return `${r >= 0 ? "+" : "−"}${Math.abs(r)}%`;
}

/** Slug is lowercase with a hyphen: "NJ 40490" -> "nj-40490" */
export function trainSlug(train: string): string {
  return train.trim().toLowerCase().replace(/\s+/g, "-");
}
