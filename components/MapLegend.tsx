import { DELAY_SCALE } from "@/lib/colors";
import { fmtInt } from "@/lib/format";
import styles from "./MapLegend.module.css";

export interface SizeSample {
  label: string;
  /** Measured arrivals at a real quantile of the station list. */
  n: number;
  /** Radius in px, same scale as the map. */
  r: number;
}

export function MapLegend({ sizes }: { sizes: SizeSample[] }) {
  return (
    <div className={styles.legend}>
      <figure className={styles.block}>
        <figcaption className={styles.caption}>Average delay, lines and dots</figcaption>
        <ol className={styles.scale}>
          {DELAY_SCALE.map((b) => (
            <li key={b.label}>
              <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
              <span className={styles.scaleLabel}>{b.label}</span>
            </li>
          ))}
        </ol>
      </figure>
      <div className={styles.row}>
        {sizes.length > 0 && (
          <figure className={styles.block}>
            <figcaption className={styles.caption}>Station size, arrivals measured</figcaption>
            <ul className={styles.sizes}>
              {sizes.map((s) => (
                <li key={s.label}>
                  <svg width={30} height={30} viewBox="-15 -15 30 30" aria-hidden="true">
                    <circle r={s.r} className={styles.sizeDot} />
                  </svg>
                  <span>
                    <span className={`mono ${styles.sizeN}`}>{fmtInt(s.n)}</span>{" "}
                    <span className={styles.sizeLabel}>{s.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </figure>
        )}
        <figure className={styles.block}>
          <figcaption className={styles.caption}>Train route</figcaption>
          <p className={styles.lineKey}>
            <svg width={64} height={14} viewBox="0 0 64 14" aria-hidden="true">
              <path d="M4 7H60" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
              <path d="M4 7H22" stroke={DELAY_SCALE[1].color} strokeWidth={4} strokeLinecap="round" />
              <path d="M22 7H42" stroke={DELAY_SCALE[2].color} strokeWidth={4} />
              <path d="M42 7H60" stroke={DELAY_SCALE[4].color} strokeWidth={4} strokeLinecap="round" />
            </svg>
            <span>each stretch coloured by the delay at the stop it reaches</span>
          </p>
        </figure>
      </div>
    </div>
  );
}
