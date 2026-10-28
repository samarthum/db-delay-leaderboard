import { DELAY_SCALE, delayBucket } from "@/lib/colors";
import type { Stop } from "@/lib/types";
import { Reveal } from "./Reveal";
import { StopList } from "./StopList";
import styles from "./RouteStrip.module.css";

export interface RouteStripProps {
  stops: Stop[];
  /** Hide the colour legend row (e.g. when the page shows one already). */
  hideLegend?: boolean;
}

/** Stops shown at each end when a long route is collapsed on phones. */
const KEEP_HEAD = 3;
const KEEP_TAIL = 3;
const COLLAPSE_OVER = 10;

function fmtDelay(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "±0 min";
  return r > 0 ? `+${r} min` : `−${-r} min`;
}

export function RouteStrip({ stops, hideLegend = false }: RouteStripProps) {
  const n = stops.length;
  const collapsible = n > COLLAPSE_OVER;
  const isMid = (i: number) => collapsible && i >= KEEP_HEAD && i < n - KEEP_TAIL;

  return (
    <Reveal className={styles.root}>
      <StopList
        className={styles.list}
        aria-label={`${n} stops in order, with the average delay at each stop`}
        total={n}
        collapsible={collapsible}
        moreIndex={KEEP_HEAD}
      >
        {stops.map((s, i) => {
          const b = delayBucket(s.avgDelay);
          const next = stops[i + 1] ? delayBucket(stops[i + 1].avgDelay).color : "transparent";
          const end = i === 0 ? "first" : i === n - 1 ? "last" : undefined;
          return (
            <li
              key={`${s.eva}-${i}`}
              className={isMid(i) ? `${styles.stop} ${styles.mid}` : styles.stop}
              data-end={end}
              data-mid={isMid(i) || undefined}
              tabIndex={isMid(i) ? -1 : undefined}
              style={{ "--c": b.color, "--next": next, "--i": i } as React.CSSProperties}
            >
              <span className={styles.rail} aria-hidden="true">
                {i > 0 && <span className={styles.up} />}
                {i < n - 1 && <span className={styles.down} />}
                <span className={styles.dot} />
              </span>
              <span className={styles.name}>
                {s.name}
                {end && <span className={styles.note}>{end === "first" ? "departure delay" : "last stop"}</span>}
              </span>
              <span className={styles.chip} style={{ background: b.color, color: b.on }}>
                <span className="visually-hidden">average delay </span>
                {fmtDelay(s.avgDelay)}
              </span>
            </li>
          );
        })}
      </StopList>
      {!hideLegend && (
        <ul className={styles.legend} aria-label="Colour key, average delay">
          {DELAY_SCALE.map((b) => (
            <li key={b.label}>
              <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
              {b.label}
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}
