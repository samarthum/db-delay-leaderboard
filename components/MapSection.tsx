"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { delayColor } from "@/lib/colors";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import type { Mode, Station, TrainDetail } from "@/lib/types";
import { useMode } from "./ModeContext";
import { MapLegend, type SizeSample } from "./MapLegend";
import styles from "./MapSection.module.css";

export interface MapSectionProps {
  /** Top-10 details per ranking, in rank order. */
  lists: Record<Mode, TrainDetail[]>;
  /** Stations with enough arrivals (already filtered by the pipeline). */
  stations: Station[];
  /** Threshold behind `Station.late` (Params.lateThresholdMinutes). */
  lateThresholdMinutes?: number;
}

/** [lon, lat] */
export type LngLat = [number, number];

export interface MapRoute {
  rank: number;
  slug: string;
  train: string;
  origin: string;
  dest: string;
  minutesAvg: number;
  percentAvg: number;
  /** Located stops in order. */
  path: LngLat[];
  /** One per pair of consecutive located stops, coloured by the delay at the later stop. */
  segments: { from: LngLat; to: LngLat; delay: number }[];
  /** Halfway along the path; the rank badge sits here. null when no stop has coordinates. */
  mid: LngLat | null;
}

export interface MapStation extends Station {
  /** Circle radius in px, sqrt scale on `n`. */
  r: number;
}

export type MapTarget = { kind: "route"; slug: string; at?: LngLat } | { kind: "station"; name: string };

type MapStatus = "idle" | "loading" | "ready" | "failed";

export const GERMANY: [LngLat, LngLat] = [
  [5.6, 47.2],
  [15.2, 55.1],
];

const MODE_COPY: Record<Mode, { button: string; showing: string }> = {
  minutes: { button: "Minutes late", showing: "average delay at the last German stop, in minutes" },
  percent: { button: "% of journey", showing: "delay relative to the scheduled journey time" },
};

const DelayMap = dynamic(() => import("./DelayMap"), { ssr: false });

function located(stops: TrainDetail["stops"]): LngLat[] {
  return stops.flatMap((s) => (s.lat === null || s.lon === null ? [] : [[s.lon, s.lat] as LngLat]));
}

function midpoint(path: LngLat[]): LngLat | null {
  if (path.length < 2) return path[0] ?? null;
  const k = Math.cos((51 * Math.PI) / 180);
  const lens = path.slice(1).map((p, i) => Math.hypot((p[0] - path[i][0]) * k, p[1] - path[i][1]));
  let left = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] && lens[i] > 0) {
      const t = left / lens[i];
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    left -= lens[i];
  }
  return path[path.length - 1];
}

function toRoutes(list: TrainDetail[]): MapRoute[] {
  return list.map((t, i) => {
    const stops = t.stops.filter((s) => s.lat !== null && s.lon !== null);
    const path = located(stops);
    return {
      rank: i + 1,
      slug: t.slug,
      train: t.train,
      origin: t.origin,
      dest: t.dest,
      minutesAvg: t.minutes.avg,
      percentAvg: t.percent.avg,
      path,
      segments: path.slice(1).map((to, j) => ({ from: path[j], to, delay: stops[j + 1].avgDelay })),
      mid: midpoint(path),
    };
  });
}

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

function radiusScale(ns: number[]): (n: number) => number {
  const lo = Math.min(...ns);
  const span = Math.max(...ns) - lo || 1;
  return (n) => 3 + 11 * Math.sqrt(Math.max(0, n - lo) / span);
}

export function trainHref(slug: string): string {
  return `/train/${slug}/`;
}

export function MapSection({ lists, stations, lateThresholdMinutes = 15 }: MapSectionProps) {
  const { mode, setMode } = useMode();
  const [status, setStatus] = useState<MapStatus>("idle");
  const [selection, setSelection] = useState<{ mode: Mode; target: MapTarget } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const routesByMode = useMemo(() => ({ minutes: toRoutes(lists.minutes), percent: toRoutes(lists.percent) }), [lists]);
  const routes = routesByMode[mode];

  const { mapStations, sizes } = useMemo(() => {
    const ns = stations.map((s) => s.n).sort((a, b) => a - b);
    if (ns.length === 0) return { mapStations: [], sizes: [] };
    const r = radiusScale(ns);
    const samples: SizeSample[] = [
      { label: "typical", n: quantile(ns, 0.5) },
      { label: "busy", n: quantile(ns, 0.9) },
      { label: "busiest", n: ns[ns.length - 1] },
    ].map((s) => ({ ...s, r: r(s.n) }));
    return {
      mapStations: stations.map((s) => ({ ...s, r: r(s.n) })).sort((a, b) => b.r - a.r),
      sizes: samples,
    };
  }, [stations]);

  const target = selection?.mode === mode ? selection.target : null;
  const selectedRoute = target?.kind === "route" ? routes.find((r) => r.slug === target.slug) : undefined;
  const select = (t: MapTarget | null) => setSelection(t ? { mode, target: t } : null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setStatus("loading");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStatus((s) => (s === "idle" ? "loading" : s));
          io.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="map" className={`section ${styles.section}`} aria-labelledby="map-title">
      <div className="container">
        <p className="eyebrow">The map · where it hurts</p>
        <h2 id="map-title" className="section-title">
          Where the minutes pile up
        </h2>
        <p className="section-sub">
          The ten worst trains, drawn stop by stop. Each stretch takes the colour of the average delay at the stop it
          arrives at, so you can watch the lateness build. Dots are stations: bigger means more measured arrivals,
          redder means later on average.
        </p>

        <div className={styles.toolbar}>
          <p className={styles.showing}>
            <span className={styles.showingKey}>On the map</span> Top 10 by {MODE_COPY[mode].showing}
          </p>
          <div className={styles.segmented} role="group" aria-label="Ranking shown on the map">
            {(Object.keys(MODE_COPY) as Mode[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {MODE_COPY[m].button}
              </button>
            ))}
          </div>
        </div>

        <div ref={frameRef} className={styles.frame} data-state={status} data-ready={status === "ready" ? "true" : undefined}>
          <PaperMap routes={routes} stations={mapStations} selected={selectedRoute?.slug ?? null} mode={mode} />
          {(status === "loading" || status === "ready") && (
            <DelayMap
              routes={routes}
              stations={mapStations}
              target={target}
              onSelect={select}
              onStatus={setStatus}
              lateThresholdMinutes={lateThresholdMinutes}
            />
          )}
          {status === "loading" && <p className={styles.pill}>Loading the interactive map…</p>}
          {status === "failed" && (
            <p className={styles.pill}>Interactive map unavailable. This is the printed timetable version.</p>
          )}
        </div>

        <MapLegend sizes={sizes} />

        <h3 className={styles.chipsTitle} id="map-routes">
          Routes on the map
        </h3>
        <ol className={styles.chips} aria-labelledby="map-routes">
          {routes.map((r) => (
            <li key={r.slug}>
              <button
                type="button"
                className={styles.chip}
                aria-pressed={selectedRoute?.slug === r.slug}
                onClick={() => select(selectedRoute?.slug === r.slug ? null : { kind: "route", slug: r.slug })}
              >
                <span className={styles.chipRank}>{r.rank}</span>
                <span className={styles.dot} style={{ background: delayColor(r.minutesAvg) }} aria-hidden="true" />
                <span className={styles.chipName}>{r.train}</span>
                <span className={`mono ${styles.chipValue}`}>
                  {mode === "minutes" ? `${fmt1(r.minutesAvg)} min` : fmtPct(r.percentAvg)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div aria-live="polite">
          {selectedRoute && (
            <div className={styles.card}>
              <p className={styles.cardTitle}>
                #{selectedRoute.rank} · {selectedRoute.train}
              </p>
              <p>
                {selectedRoute.origin} → {selectedRoute.dest}
              </p>
              <p className="mono">
                {fmt1(selectedRoute.minutesAvg)} min average delay · {fmtPct(selectedRoute.percentAvg)} of scheduled
                journey time
              </p>
              <a className={styles.cardLink} href={trainHref(selectedRoute.slug)}>
                Open the {selectedRoute.train} page →
              </a>
            </div>
          )}
        </div>

        <p className={styles.credit}>
          Map: <a href="https://openfreemap.org">OpenFreeMap</a> · © <a href="https://openmaptiles.org">OpenMapTiles</a> ·
          Data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Station coordinates:
          Trainline stations (ODbL) · {fmtInt(stations.length)} stations with enough measured arrivals
        </p>
      </div>
    </section>
  );
}

/** Germany bounds for the paper map: equirectangular with a cos(lat) x correction. */
const BOX = { west: 5.5, east: 15.3, south: 47.0, north: 55.2 };
const KX = Math.cos((((BOX.south + BOX.north) / 2) * Math.PI) / 180);
const SVG_H = 1000;
const SCALE = SVG_H / (BOX.north - BOX.south);
const SVG_W = Math.round((BOX.east - BOX.west) * KX * SCALE);
/** viewBox units per CSS px at the reserved frame heights (about 2 at 440-600px tall). */
const UNITS_PER_PX = 2;

function project([lon, lat]: LngLat): [number, number] {
  return [(lon - BOX.west) * KX * SCALE, (BOX.north - lat) * SCALE];
}

function pt(p: LngLat): string {
  const [x, y] = project(p);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = out.get(k);
    if (list) list.push(it);
    else out.set(k, [it]);
  }
  return out;
}

/** Static SVG version of the map: SSR, placeholder while MapLibre loads, and fallback without WebGL. */
function PaperMap({
  routes,
  stations,
  selected,
  mode,
}: {
  routes: MapRoute[];
  stations: MapStation[];
  selected: string | null;
  mode: Mode;
}) {
  const stationPaths = useMemo(
    () =>
      [...groupBy(stations, (s) => delayColor(s.avg))].map(([color, list]) => ({
        color,
        d: list
          .map((s) => {
            const [x, y] = project([s.lon, s.lat]);
            const r = s.r * UNITS_PER_PX;
            return `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;
          })
          .join(""),
      })),
    [stations],
  );

  const drawOrder = useMemo(() => [...routes].reverse(), [routes]);

  return (
    <svg
      className={styles.paper}
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Map of Germany with the top ${routes.length} trains by ${MODE_COPY[mode].showing}, coloured by delay, over ${stations.length} stations. The routes are listed below the map.`}
    >
      <g opacity={0.8}>
        {stationPaths.map((p) => (
          <path key={p.color} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
      {drawOrder.map((r) => {
        const dim = selected !== null && selected !== r.slug;
        const width = selected === r.slug ? 7 : 4;
        return (
          <g key={r.slug} opacity={dim ? 0.3 : 1}>
            <polyline
              points={r.path.map(pt).join(" ")}
              fill="none"
              stroke="#fff"
              strokeWidth={width + 3}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {[...groupBy(r.segments, (s) => delayColor(s.delay))].map(([color, segs]) => (
              <path
                key={color}
                d={segs.map((s) => `M${pt(s.from)}L${pt(s.to)}`).join("")}
                stroke={color}
                strokeWidth={width}
                strokeLinecap="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        );
      })}
      {drawOrder.map((r) => {
        if (!r.mid) return null;
        const [x, y] = project(r.mid);
        return (
          <g key={r.slug} opacity={selected !== null && selected !== r.slug ? 0.3 : 1}>
            <circle cx={x} cy={y} r={11 * UNITS_PER_PX} fill="#1c202a" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <text x={x} y={y} dy="0.35em" textAnchor="middle" className={styles.paperBadge}>
              {r.rank}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
