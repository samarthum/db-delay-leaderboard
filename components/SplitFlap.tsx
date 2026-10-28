import { Reveal } from "./Reveal";
import styles from "./SplitFlap.module.css";

export interface SplitFlapProps {
  /** Final text, e.g. "64" or "+18%". One tile per character. */
  text: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** Accessible name; defaults to `text`. Tiles are aria-hidden. */
  label?: string;
  /** Glyph colour. Amber is for the one accent number in a view. */
  tone?: "light" | "amber";
  className?: string;
}

const NARROW = new Set([",", ".", ":", "'", " "]);

/**
 * Departure-board tiles. Server-rendered with the final characters; the flip is a CSS animation
 * (see SplitFlap.module.css) that Reveal replays when the board scrolls into view.
 */
export function SplitFlap({ text, size = "md", label, tone = "light", className }: SplitFlapProps) {
  const chars = Array.from(text);
  return (
    <Reveal
      as="span"
      role="img"
      aria-label={label ?? text}
      className={[styles.root, styles[size], tone === "amber" ? styles.amber : "", className ?? ""].join(" ")}
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={NARROW.has(ch) ? `${styles.tile} ${styles.narrow}` : styles.tile}
          style={{ "--i": i } as React.CSSProperties}
        >
          <span className={styles.glyph}>{ch === " " ? " " : ch}</span>
        </span>
      ))}
    </Reveal>
  );
}
