"use client";

import type { MonthPoint } from "@/lib/types";

export interface MonthlyChartProps {
  /** One point per window month, ascending. */
  months: MonthPoint[];
}

/** STUB: owned by the charts worker. Home page chart: avg delay + cancel % per month. */
export function MonthlyChart({ months }: MonthlyChartProps) {
  return <pre>{months.map((m) => `${m.month} ${m.avgDelayMin}`).join("\n")}</pre>;
}
