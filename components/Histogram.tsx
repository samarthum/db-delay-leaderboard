import { delayBucket } from "@/lib/colors";
import { fmt1, fmtInt } from "@/lib/format";
import type { HistBin } from "@/lib/types";
import { Reveal } from "./Reveal";
import styles from "./Histogram.module.css";

export interface HistogramProps {
  bins: HistBin[];
  /** One short line under the chart. */
  caption?: string;
}

type Band = "onTime" | "late" | "veryLate";

const BAND_ORDER: Band[] = ["onTime", "late", "veryLate"];
const BAND_TITLE: Record<Band, string> = { onTime: "On time", late: "Late", veryLate: "Very late" };

/** Bands follow the bin bounds, not the labels: under 5 min, 5 to 60, 60 and up. */
function bandOf(b: HistBin): Band {
  if (b.hi !== null && b.hi <= 5) return "onTime";
  if (b.lo !== null && b.lo >= 60) return "veryLate";
  return "late";
}

function bandRange(bins: HistBin[]): string {
  const los = bins.map((b) => b.lo);
  const his = bins.map((b) => b.hi);
  const lo = los.includes(null) ? null : Math.min(...(los as number[]));
  const hi = his.includes(null) ? null : Math.max(...(his as number[]));
  if (lo === null && hi !== null) return `under ${hi} min`;
  if (hi === null && lo !== null) return `${lo}+ min`;
  return `${lo} to ${hi} min`;
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

export function Histogram({ bins, caption }: HistogramProps) {
  const maxShare = Math.max(...bins.map((b) => b.share), 0.0001);
  const groups = BAND_ORDER.map((band) => ({ band, bins: bins.filter((b) => bandOf(b) === band) })).filter(
    (g) => g.bins.length > 0,
  );

  return (
    <Reveal as="figure" className={styles.root}>
      <div aria-hidden="true">
        <div className={styles.head}>
          <span>Minutes late</span>
          <span>Trips</span>
        </div>
        {groups.map((g) => (
          <div key={g.band} className={styles.group} data-band={g.band}>
            <div className={styles.groupHead}>
              <span className={styles.groupTitle}>{BAND_TITLE[g.band]}</span>
              <span className={styles.groupRange}>{bandRange(g.bins)}</span>
              <span className={styles.groupShare}>{fmt1(sum1(g.bins))}%</span>
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
                      <span className={styles.share}>{fmt1(b.share)}%</span>
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
        <caption>Delay at the last German stop, share of measured runs</caption>
        <thead>
          <tr>
            <th scope="col">Minutes late</th>
            <th scope="col">Share of runs (%)</th>
            <th scope="col">Runs</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((b) => (
            <tr key={b.label}>
              <th scope="row">{b.label}</th>
              <td>{fmt1(b.share)}</td>
              <td>{fmtInt(b.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Reveal>
  );
}
