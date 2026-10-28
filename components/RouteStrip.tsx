import type { Stop } from "@/lib/types";

export interface RouteStripProps {
  stops: Stop[];
}

/** STUB: owned by the charts worker. Lightweight SVG strip of stops coloured by per-stop delay. */
export function RouteStrip({ stops }: RouteStripProps) {
  return <pre>{stops.map((s) => `${s.name} ${s.avgDelay}`).join("\n")}</pre>;
}
