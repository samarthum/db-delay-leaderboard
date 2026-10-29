"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  LngLatBounds,
  Map as MapLibre,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapGeoJSONFeature,
  type PointLike,
} from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { delayColor } from "@/lib/colors";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import { GERMANY, trainHref, type LngLat, type MapRoute, type MapStation, type MapTarget } from "./MapSection";
import styles from "./DelayMap.module.css";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const LOAD_TIMEOUT_MS = 20000;
const BADGE_FILL = "#1c202a";

// MapLibre derives the worker URL from its own import.meta.url, which a bundled chunk does not keep.
setWorkerUrl(new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

const LOCALE = {
  "CooperativeGesturesHandler.WindowsHelpText": "Hold Ctrl and scroll to zoom the map",
  "CooperativeGesturesHandler.MacHelpText": "Hold ⌘ and scroll to zoom the map",
  "CooperativeGesturesHandler.MobileHelpText": "Two fingers move the map. One finger keeps the page scrolling.",
};

const LAYERS = {
  stations: "dm-stations",
  casing: "dm-route-casing",
  line: "dm-route-line",
  hit: "dm-route-hit",
  badge: "dm-badge",
  badgeText: "dm-badge-text",
} as const;
const CLICKABLE = [LAYERS.badge, LAYERS.hit, LAYERS.stations];

export interface DelayMapProps {
  routes: MapRoute[];
  stations: MapStation[];
  target: MapTarget | null;
  onSelect: (t: MapTarget | null) => void;
  onStatus: (s: "ready" | "failed") => void;
  lateThresholdMinutes: number;
}

type FC = GeoJSON.FeatureCollection;

function routeGeo(routes: MapRoute[]): { lines: FC; hits: FC; badges: FC } {
  const sort = (r: MapRoute) => routes.length + 1 - r.rank;
  return {
    lines: {
      type: "FeatureCollection",
      features: routes.flatMap((r) =>
        r.segments.map((s) => ({
          type: "Feature" as const,
          properties: { slug: r.slug, sort: sort(r), color: delayColor(s.delay) },
          geometry: { type: "LineString" as const, coordinates: [s.from, s.to] },
        })),
      ),
    },
    hits: {
      type: "FeatureCollection",
      features: routes
        .filter((r) => r.path.length > 1)
        .map((r) => ({
          type: "Feature" as const,
          properties: { slug: r.slug, sort: sort(r) },
          geometry: { type: "LineString" as const, coordinates: r.path },
        })),
    },
    badges: {
      type: "FeatureCollection",
      features: routes.flatMap((r) =>
        r.mid
          ? [
              {
                type: "Feature" as const,
                properties: { slug: r.slug, sort: sort(r), label: String(r.rank) },
                geometry: { type: "Point" as const, coordinates: r.mid },
              },
            ]
          : [],
      ),
    },
  };
}

function stationGeo(stations: MapStation[]): FC {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      properties: { name: s.name, r: s.r, color: delayColor(s.avg) },
      geometry: { type: "Point", coordinates: [s.lon, s.lat] },
    })),
  };
}

function boundsOf(points: LngLat[]): LngLatBounds {
  const b = new LngLatBounds(GERMANY[0], GERMANY[1]);
  for (const p of points) b.extend(p);
  return b;
}

function sameBounds(a: LngLatBounds, b: LngLatBounds): boolean {
  const tol = 0.25;
  return (
    Math.abs(a.getWest() - b.getWest()) < tol &&
    Math.abs(a.getEast() - b.getEast()) < tol &&
    Math.abs(a.getSouth() - b.getSouth()) < tol &&
    Math.abs(a.getNorth() - b.getNorth()) < tol
  );
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function routePopup(r: MapRoute): HTMLElement {
  const root = el("div", styles.body);
  root.append(
    el("p", styles.title, `#${r.rank} · ${r.train}`),
    el("p", styles.route, `${r.origin} → ${r.dest}`),
    el("p", styles.figures, `${fmt1(r.minutesAvg)} min late on average`),
    el("p", styles.figures, `${fmtPct(r.percentAvg)} of the trip`),
  );
  const link = el("a", styles.link, `See ${r.train} →`);
  link.href = trainHref(r.slug);
  root.append(link);
  return root;
}

function stationPopup(s: MapStation, lateThreshold: number): HTMLElement {
  const root = el("div", styles.body);
  root.append(
    el("p", styles.title, s.name),
    el("p", styles.figures, `${fmt1(s.avg)} min late on average`),
    el("p", styles.figures, `${fmt1(s.late)}% of trains ${lateThreshold}+ min late`),
    el("p", styles.route, `${fmtInt(s.n)} arrivals`),
  );
  return root;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function fitPadding(container: HTMLElement): number {
  return container.clientWidth < 600 ? 20 : 48;
}

export default function DelayMap({ routes, stations, target, onSelect, onStatus, lateThresholdMinutes }: DelayMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibre | null>(null);
  const callbacks = useRef({ onSelect, onStatus });
  callbacks.current = { onSelect, onStatus };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let instance: MapLibre;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      callbacks.current.onStatus("failed");
    };
    try {
      instance = new MapLibre({
        container,
        style: STYLE_URL,
        bounds: GERMANY,
        fitBoundsOptions: { padding: fitPadding(container) },
        minZoom: 4,
        maxZoom: 13,
        maxBounds: [
          [-2, 43],
          [23, 58],
        ],
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        renderWorldCopies: false,
        fadeDuration: prefersReducedMotion() ? 0 : 300,
        attributionControl: { compact: false },
        locale: LOCALE,
      });
    } catch {
      fail();
      return;
    }
    instance.touchZoomRotate.disableRotation();
    instance.keyboard.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), "top-right");

    let styleLoaded = false;
    const timeout = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    // Before the style parses, any error means no usable map; afterwards it is a stray tile and the map still works.
    instance.on("error", () => {
      if (!styleLoaded) fail();
    });
    instance.once("style.load", () => {
      styleLoaded = true;
    });

    instance.on("load", () => {
      window.clearTimeout(timeout);
      if (settled) return;
      const empty: FC = { type: "FeatureCollection", features: [] };
      for (const id of ["dm-stations", "dm-lines", "dm-hits", "dm-badges"]) instance.addSource(id, { type: "geojson", data: empty });
      const firstSymbol = instance.getStyle().layers.find((l) => l.type === "symbol")?.id;
      instance.addLayer(
        {
          id: LAYERS.stations,
          type: "circle",
          source: "dm-stations",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, ["get", "r"], 10, ["*", ["get", "r"], 1.8]],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.72,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
          },
        },
        firstSymbol,
      );
      const line: LineLayerSpecification["layout"] = { "line-join": "round", "line-cap": "round", "line-sort-key": ["get", "sort"] };
      instance.addLayer(
        {
          id: LAYERS.casing,
          type: "line",
          source: "dm-lines",
          layout: line,
          paint: { "line-color": "#ffffff", "line-width": 7.5 },
        },
        firstSymbol,
      );
      instance.addLayer(
        {
          id: LAYERS.line,
          type: "line",
          source: "dm-lines",
          layout: line,
          paint: { "line-color": ["get", "color"], "line-width": 4 },
        },
        firstSymbol,
      );
      instance.addLayer({
        id: LAYERS.hit,
        type: "line",
        source: "dm-hits",
        layout: line,
        paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 18 },
      });
      instance.addLayer({
        id: LAYERS.badge,
        type: "circle",
        source: "dm-badges",
        layout: { "circle-sort-key": ["get", "sort"] },
        paint: {
          "circle-radius": 11,
          "circle-color": BADGE_FILL,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
      instance.addLayer({
        id: LAYERS.badgeText,
        type: "symbol",
        source: "dm-badges",
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "symbol-sort-key": ["get", "sort"],
        },
        paint: { "text-color": "#ffffff" },
      });

      const hitBox = (p: { x: number; y: number }, pad: number): [PointLike, PointLike] => [
        [p.x - pad, p.y - pad],
        [p.x + pad, p.y + pad],
      ];
      const topFeature = (p: { x: number; y: number }, pad: number): MapGeoJSONFeature | undefined =>
        instance.queryRenderedFeatures(hitBox(p, pad), { layers: CLICKABLE })[0];

      instance.on("click", (e) => {
        const f = topFeature(e.point, 8);
        const props = f?.properties ?? {};
        if (!f) callbacks.current.onSelect(null);
        else if (f.layer.id === LAYERS.stations) callbacks.current.onSelect({ kind: "station", name: String(props.name) });
        else callbacks.current.onSelect({ kind: "route", slug: String(props.slug), at: [e.lngLat.lng, e.lngLat.lat] });
      });
      instance.on("mousemove", (e) => {
        instance.getCanvas().style.cursor = topFeature(e.point, 3) ? "pointer" : "";
      });

      setMap(instance);
    });

    return () => {
      window.clearTimeout(timeout);
      settled = true;
      setMap(null);
      instance.remove();
    };
  }, []);

  const routeData = useMemo(() => routeGeo(routes), [routes]);
  const stationData = useMemo(() => stationGeo(stations), [stations]);
  const stationsByName = useMemo(() => new Map(stations.map((s) => [s.name, s])), [stations]);
  const fitted = useRef<LngLatBounds | null>(null);
  const announced = useRef(false);

  useEffect(() => {
    if (!map) return;
    (map.getSource("dm-stations") as GeoJSONSource).setData(stationData);
    if (!announced.current) {
      announced.current = true;
      map.once("idle", () => callbacks.current.onStatus("ready"));
    }
  }, [map, stationData]);

  useEffect(() => {
    if (!map) return;
    (map.getSource("dm-lines") as GeoJSONSource).setData(routeData.lines);
    (map.getSource("dm-hits") as GeoJSONSource).setData(routeData.hits);
    (map.getSource("dm-badges") as GeoJSONSource).setData(routeData.badges);
    const next = boundsOf(routes.flatMap((r) => r.path));
    const prev = fitted.current ?? boundsOf([]);
    fitted.current = next;
    if (!sameBounds(prev, next)) {
      map.fitBounds(next, { padding: fitPadding(map.getContainer()), duration: prefersReducedMotion() ? 0 : 600 });
    }
  }, [map, routeData, routes]);

  useEffect(() => {
    if (!map) return;
    const slug = target?.kind === "route" ? target.slug : null;
    const isSel: ExpressionSpecification = ["==", ["get", "slug"], slug ?? ""];
    map.setPaintProperty(LAYERS.line, "line-width", slug ? ["case", isSel, 7, 4] : 4);
    map.setPaintProperty(LAYERS.line, "line-opacity", slug ? ["case", isSel, 1, 0.35] : 1);
    map.setPaintProperty(LAYERS.casing, "line-width", slug ? ["case", isSel, 11, 7.5] : 7.5);
    map.setPaintProperty(LAYERS.casing, "line-opacity", slug ? ["case", isSel, 1, 0.35] : 1);
    if (!target) return;

    let content: HTMLElement;
    let at: LngLat;
    if (target.kind === "route") {
      const r = routes.find((x) => x.slug === target.slug);
      if (!r?.mid) return;
      content = routePopup(r);
      at = target.at ?? r.mid;
      if (!target.at && r.path.length > 1) {
        map.fitBounds(boundsOfPath(r.path), {
          padding: fitPadding(map.getContainer()) + 40,
          maxZoom: 8,
          duration: prefersReducedMotion() ? 0 : 700,
        });
      }
    } else {
      const s = stationsByName.get(target.name);
      if (!s) return;
      content = stationPopup(s, lateThresholdMinutes);
      at = [s.lon, s.lat];
    }
    const popup = new Popup({ className: styles.popup, closeOnClick: false, maxWidth: "280px", offset: 10 })
      .setLngLat(at)
      .setDOMContent(content)
      .addTo(map);
    const onClose = () => callbacks.current.onSelect(null);
    popup.on("close", onClose);
    return () => {
      popup.off("close", onClose);
      popup.remove();
    };
  }, [map, target, routes, stationsByName, lateThresholdMinutes]);

  return <div ref={containerRef} className={styles.map} />;
}

function boundsOfPath(path: LngLat[]): LngLatBounds {
  const b = new LngLatBounds(path[0], path[0]);
  for (const p of path) b.extend(p);
  return b;
}
