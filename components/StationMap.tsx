import type { Params, Station, WindowInfo } from "@/lib/types";
import { STATION_SCALE, stationBucket } from "@/lib/colors";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
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

export function StationMap({ stations, params: p, window: w }: { stations: Station[]; params: Params; window: WindowInfo }) {
  const big = stations.filter((s) => s.n >= p.bigStationMinArrivals);
  const latest = [...big].sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name)).slice(0, LIST_SIZE);

  return (
    <section id="map" className="section" aria-labelledby="map-title">
      <div className="container">
        <h2 id="map-title" className="section-title">
          Where trains arrive late
        </h2>
        <p className="section-sub">
          Each dot is a station. The darker the dot, the later trains arrive there on average. All long-distance and
          regional trains, {monthLabel(w.firstMonth)} to {monthLabel(w.lastMonth)}.
        </p>

        <div className={styles.layout}>
          <figure className={styles.card}>
            <svg
              className={styles.map}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Map of Germany with ${fmtInt(stations.length)} stations coloured by average arrival delay. The latest big stations are listed next to it.`}
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
              <span className={styles.legendTitle}>Average minutes late on arrival</span>
              <ul className={styles.keys}>
                {STATION_SCALE.map((b) => (
                  <li key={b.label}>
                    <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
                    {b.label}
                  </li>
                ))}
                <li>
                  <span className={styles.bigSwatch} aria-hidden="true" />
                  {fmtInt(p.bigStationMinArrivals)}+ arrivals
                </li>
              </ul>
            </figcaption>
          </figure>

          <div className={styles.side}>
            <h3 className={styles.listTitle}>Latest big stations</h3>
            <ol className={styles.list}>
              {latest.map((s) => (
                <li key={s.name} className={styles.item}>
                  <span className={styles.name}>{s.name}</span>
                  <span className={styles.value}>{fmt1(s.avg)} min</span>
                  <span className={styles.count}>{fmtInt(s.n)} arrivals</span>
                </li>
              ))}
            </ol>
            <p className={styles.note}>
              Big means at least {fmtInt(p.bigStationMinArrivals)} arrivals. {fmtInt(big.length)} stations qualify.
            </p>
          </div>
        </div>

        <p className={styles.credit}>
          Station coordinates: Trainline stations (ODbL). Outline: Natural Earth.
        </p>
      </div>
    </section>
  );
}
