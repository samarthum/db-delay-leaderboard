import { DELAY_SCALE } from "@/lib/colors";
import styles from "./MapLegend.module.css";

export function MapLegend() {
  return (
    <figure className={styles.legend}>
      <figcaption className={styles.caption}>Average delay</figcaption>
      <ol className={styles.scale}>
        {DELAY_SCALE.map((b) => (
          <li key={b.label}>
            <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
            <span className={styles.scaleLabel}>{b.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
