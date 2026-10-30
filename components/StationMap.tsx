import type { Params, Station, WindowInfo } from "@/lib/types";
import { STATION_SCALE, stationBucket } from "@/lib/colors";
import { fmt1, fmtInt, spanLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import germany from "@/lib/germany.json";
import styles from "./StationMap.module.css";

/** Equirectangular projection with a cos(latitude) correction, framed on Germany. */
const BOX = { west: 5.7, east: 15.2, south: 47.1, north: 55.2 };
const KX = Math.cos((51.2 * Math.PI) / 180);
const H = 1000;
const SCALE = H / (BOX.north - BOX.south);
const W = Math.round((BOX.east - BOX.west) * KX * SCALE);
const LIST_SIZE = 5;

const CITIES: [string, number, number][] = [
  ["Hamburg", 10.007, 53.553],
  ["Berlin", 13.369, 52.525],
  ["Hannover", 9.742, 52.377],
  ["Düsseldorf", 6.794, 51.22],
  ["Köln", 6.959, 50.943],
  ["Leipzig", 12.382, 51.345],
  ["Dresden", 13.732, 51.04],
  ["Frankfurt", 8.663, 50.107],
  ["Nürnberg", 11.082, 49.446],
  ["Stuttgart", 9.182, 48.784],
  ["München", 11.558, 48.14],
];

/** "under 2" / "2 to 4" / "8+ min" from the scale's English label, in the page language. */
function scaleLabel(label: string, t: ReturnType<typeof makeT>): string {
  const under = /^under (\d+)$/.exec(label);
  if (under) return t("scale.under", { n: under[1] });
  const range = /^(\d+) to (\d+)$/.exec(label);
  if (range) return t("scale.range", { a: range[1], b: range[2] });
  const plus = /^(\d+)\+ min$/.exec(label);
  if (plus) return t("scale.plus", { n: plus[1] });
  return label;
}

function project(lon: number, lat: number): [number, number] {
  return [(lon - BOX.west) * KX * SCALE, (BOX.north - lat) * SCALE];
}

const OUTLINE = germany.rings
  .map((ring) => `M${ring.map(([lon, lat]) => project(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L")}Z`)
  .join("");

/**
 * One path per (size, colour): each dot is a zero-length segment drawn with a round cap.
 * Small stations go first so big ones sit on top; within a size, later colours draw over earlier ones.
 */
function dotPaths(stations: Station[], bigMin: number) {
  const groups = new Map<string, { big: boolean; bucket: number; d: string[] }>();
  for (const big of [false, true]) {
    STATION_SCALE.forEach((_, bucket) => groups.set(`${big}-${bucket}`, { big, bucket, d: [] }));
  }
  for (const s of stations) {
    const [x, y] = project(s.lon, s.lat);
    if (x < 0 || y < 0 || x > W || y > H) continue;
    groups.get(`${s.n >= bigMin}-${stationBucket(s.avg)}`)!.d.push(`M${Math.round(x)} ${Math.round(y)}h0`);
  }
  return [...groups.values()].filter((g) => g.d.length > 0);
}

export function StationMap({ stations, params: p, window: w, lang }: { stations: Station[]; params: Params; window: WindowInfo; lang: Lang }) {
  const t = makeT(lang);
  const big = stations.filter((s) => s.n >= p.bigStationMinArrivals);
  const latest = [...big].sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name)).slice(0, LIST_SIZE);

  return (
    <section id="map" className="sec" aria-labelledby="map-title">
      <div>
        <h2 id="map-title">
          {t("network.map.title")}
        </h2>
        <p className="sec-sub">{t("network.map.sub", { span: spanLabel(w.firstMonth, w.lastMonth, lang) })}</p>

        <div className={styles.layout}>
          <figure className={styles.card}>
            <svg
              className={styles.map}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={t("network.map.aria", { n: fmtInt(stations.length, lang) })}
            >
              <path d={OUTLINE} className={styles.land} />
              {dotPaths(stations, p.bigStationMinArrivals).map((g) => (
                <path
                  key={`${g.big}-${g.bucket}`}
                  d={g.d.join("")}
                  className={g.big ? styles.bigDots : styles.dots}
                  stroke={STATION_SCALE[g.bucket].color}
                />
              ))}
              {CITIES.map(([name, lon, lat]) => {
                const [x, y] = project(lon, lat);
                return (
                  <text key={name} x={x + 12} y={y + 8} className={styles.city}>
                    {name}
                  </text>
                );
              })}
            </svg>

            <figcaption className={styles.legend}>
              <span className={styles.legendTitle}>{t("network.map.legend")}</span>
              <ul className={styles.keys}>
                {STATION_SCALE.map((b) => (
                  <li key={b.label}>
                    <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
                    {scaleLabel(b.label, t)}
                  </li>
                ))}
                <li>
                  <span className={styles.bigSwatch} aria-hidden="true" />
                  {t("network.map.big", { n: fmtInt(p.bigStationMinArrivals, lang) })}
                </li>
              </ul>
            </figcaption>
          </figure>

          <div className={styles.side}>
            <h3 className={styles.listTitle}>{t("network.map.latest")}</h3>
            <ol className={styles.list}>
              {latest.map((s) => (
                <li key={s.name} className={styles.item}>
                  <span className={styles.name}>{s.name}</span>
                  <span className={styles.value}>{fmt1(s.avg, lang)} {t("unit.min")}</span>
                  <span className={styles.count}>{t("network.map.arrivals", { n: fmtInt(s.n, lang) })}</span>
                </li>
              ))}
            </ol>
            <p className={styles.note}>
              {t("network.map.bigNote", { min: fmtInt(p.bigStationMinArrivals, lang), n: fmtInt(big.length, lang) })}
            </p>
          </div>
        </div>

        <p className={styles.credit}>{t("network.map.credit")}</p>
      </div>
    </section>
  );
}
