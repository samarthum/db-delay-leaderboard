"use client";

import type { MonthAvg } from "@/lib/types";

export interface TrainMonthChartProps {
  monthly: MonthAvg[];
  /** Network-wide average per month, drawn as a reference line when given. */
  networkAvg?: { month: string; avg: number }[];
}

/** STUB: owned by the charts worker. Per-train avg delay by month. */
export function TrainMonthChart({ monthly }: TrainMonthChartProps) {
  return <pre>{monthly.map((m) => `${m.month} ${m.avg}`).join("\n")}</pre>;
}
