"use client";

import type { Mode, Station, TrainDetail } from "@/lib/types";

export interface MapSectionProps {
  /** Top-10 details per ranking, in rank order. */
  lists: Record<Mode, TrainDetail[]>;
  /** Stations with enough arrivals (already filtered by the pipeline). */
  stations: Station[];
}

/** STUB: owned by the map worker. Lazy MapLibre section (its own file imports maplibre via dynamic import). */
export function MapSection({ stations }: MapSectionProps) {
  return <section id="map">{stations.length} stations</section>;
}
