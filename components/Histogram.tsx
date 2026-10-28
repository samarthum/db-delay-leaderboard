import type { HistBin } from "@/lib/types";

export interface HistogramProps {
  bins: HistBin[];
}

/** STUB: owned by the charts worker. Delay distribution bars (7 fixed bins). */
export function Histogram({ bins }: HistogramProps) {
  return <pre>{bins.map((b) => `${b.label} ${b.count}`).join("\n")}</pre>;
}
