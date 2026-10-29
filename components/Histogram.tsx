import { delayBucket } from "@/lib/colors";
import { fmt1, fmtInt } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT, type T } from "@/lib/t";
import type { HistBin } from "@/lib/types";
import { Reveal } from "./Reveal";
import styles from "./Histogram.module.css";

export interface HistogramProps {
  bins: HistBin[];
  /** One short line under the chart. */
  caption?: string;
  lang?: Lang;
}

type Band = "onTime" | "late" | "veryLate";

const BAND_ORDER: Band[] = ["onTime", "late", "veryLate"];
const BAND_KEY = { onTime: "hist.onTime", late: "hist.late", veryLate: "hist.veryLate" } as const;

/** Bands follow the bin bounds, not the labels: under 5 min, 5 to 60, 60 and up. */
function bandOf(b: HistBin): Band {
  if (b.hi !== null && b.hi <= 5) return "onTime";
  if (b.lo !== null && b.lo >= 60) return "veryLate";
  return "late";
}

function bandRange(bins: HistBin[], t: T): string {
  const los = bins.map((b) => b.lo);
  const his = bins.map((b) => b.hi);
  const lo = los.includes(null) ? null : Math.min(...(los as number[]));
  const hi = his.includes(null) ? null : Math.max(...(his as number[]));
  if (lo === null && hi !== null) return t("hist.under", { n: hi });
  if (hi === null && lo !== null) return t("hist.plus", { n: lo });
  return t("hist.range", { a: lo ?? 0, b: hi ?? 0 });
}

/** Representative minutes for colouring a bin: the first colour bucket for "<0", 130 for "120+". */
function binColorMinutes(b: HistBin): number {
  if (b.lo === null) return -Infinity;
  if (b.hi === null) return 130;
  return (b.lo + b.hi) / 2;
}

/** Percent of measured runs at least `minutes` late, summed from whole bins (e.g. 30 -> "30-60" and up). */
export function shareAtLeast(bins: HistBin[], minutes: number): number {
  const sum = bins.reduce((s, b) => (b.lo !== null && b.lo >= minutes ? s + b.share : s), 0);
  return Math.round(sum * 10) / 10;
}

const sum1 = (bins: HistBin[]) => Math.round(bins.reduce((s, b) => s + b.share, 0) * 10) / 10;

export function Histogram({ bins, caption, lang = "en" }: HistogramProps) {
  const t = makeT(lang);
  const maxShare = Math.max(...bins.map((b) => b.share), 0.0001);
  const groups = BAND_ORDER.map((band) => ({ band, bins: bins.filter((b) => bandOf(b) === band) })).filter(
    (g) => g.bins.length > 0,
  );

  return (
    <Reveal as="figure" className={styles.root}>
      <div aria-hidden="true">
        <div className={styles.head}>
          <span>{t("hist.minutes")}</span>
          <span>{t("hist.trips")}</span>
        </div>
        {groups.map((g) => (
          <div key={g.band} className={styles.group} data-band={g.band}>
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>{t(BAND_KEY[g.band])}</span>
              <span className={styles.groupRange}>{bandRange(g.bins, t)}</span>
              <span className={styles.groupShare}>{fmt1(sum1(g.bins), lang)}{lang === "de" ? "\u00a0%" : "%"}</span>
            </div>
            <ul className={styles.rows}>
              {g.bins.map((b) => {
                const bucket = delayBucket(binColorMinutes(b));
                return (
                  <li key={b.label} className={styles.row} style={{ "--i": bins.indexOf(b) } as React.CSSProperties}>
                    <span className={styles.label}>{b.label.replace("-", "–")}</span>
                    <span className={styles.track}>
                      <span
                        className={styles.bar}
                        style={{ width: `${(b.share / maxShare) * 100}%`, background: bucket.color }}
                      />
                    </span>
                    <span className={styles.nums}>
                      <span className={styles.share}>{fmt1(b.share, lang)}{lang === "de" ? "\u00a0%" : "%"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {caption && <figcaption className={styles.caption}>{caption}</figcaption>}
      <table className="visually-hidden">
        <caption>{t("hist.tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("hist.minutes")}</th>
            <th scope="col">{t("hist.colShare")}</th>
            <th scope="col">{t("hist.colRuns")}</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{fmt1(b.share, lang)}</td>
              <td>{fmtInt(b.count, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Reveal>
  );
}
