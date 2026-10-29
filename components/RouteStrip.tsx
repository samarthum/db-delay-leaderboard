import { DELAY_SCALE, delayBucket } from "@/lib/colors";
import type { Stop } from "@/lib/types";
import type { Lang } from "@/lib/i18n";
import { makeT, type T } from "@/lib/t";
import { Reveal } from "./Reveal";
import { StopList } from "./StopList";
import styles from "./RouteStrip.module.css";

export interface RouteStripProps {
  stops: Stop[];
  /** Hide the colour legend row (e.g. when the page shows one already). */
  hideLegend?: boolean;
  lang?: Lang;
}

/** Stops shown at each end when a long route is collapsed on phones. */
const KEEP_HEAD = 3;
const KEEP_TAIL = 3;
const COLLAPSE_OVER = 10;

/** "under 5 min" / "5 to 10" / "50+ min" from the scale's English label, in the page language. */
function legendLabel(label: string, t: T): string {
  const under = /^under (\d+) min$/.exec(label);
  if (under) return t("hist.under", { n: under[1] });
  const range = /^(\d+) to (\d+)$/.exec(label);
  if (range) return t("scale.range", { a: range[1], b: range[2] });
  const plus = /^(\d+)\+ min$/.exec(label);
  if (plus) return t("hist.plus", { n: plus[1] });
  return label;
}

function fmtDelay(v: number, t: T): string {
  const r = Math.round(v);
  const min = t("unit.min");
  if (r === 0) return t("strip.zero");
  return r > 0 ? `+${r} ${min}` : `−${-r} ${min}`;
}

export function RouteStrip({ stops, hideLegend = false, lang = "en" }: RouteStripProps) {
  const t = makeT(lang);
  const n = stops.length;
  const collapsible = n > COLLAPSE_OVER;
  const isMid = (i: number) => collapsible && i >= KEEP_HEAD && i < n - KEEP_TAIL;

  return (
    <Reveal className={styles.root}>
      <StopList
        className={styles.list}
        aria-label={t("strip.aria", { n })}
        lang={lang}
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
                {end && <span className={styles.note}>{end === "first" ? t("strip.first") : t("strip.last")}</span>}
              </span>
              <span className={styles.chip} style={{ background: b.color, color: b.on }}>
                <span className="visually-hidden">{t("strip.avgDelay")} </span>
                {fmtDelay(s.avgDelay, t)}
              </span>
            </li>
          );
        })}
      </StopList>
      {!hideLegend && (
        <ul className={styles.legend} aria-label={t("strip.legend")}>
          {DELAY_SCALE.map((b) => (
            <li key={b.label}>
              <span className={styles.swatch} style={{ background: b.color }} aria-hidden="true" />
              {legendLabel(b.label, t)}
            </li>
          ))}
        </ul>
      )}
    </Reveal>
  );
}
