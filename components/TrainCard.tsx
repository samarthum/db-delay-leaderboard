import Link from "next/link";
import type { Dist, Mode, TrainSummary } from "@/lib/types";
import { fmt1, fmtInt, fmtPct } from "@/lib/format";
import { delayColor } from "@/lib/colors";
import { fmtDuration, fmtRank, fmtStat } from "./pageFormat";
import styles from "./TrainCard.module.css";

function distValue(v: number, mode: Mode) {
  return (
    <>
      {fmtStat(v)}
      <span className={styles.u}>{mode === "minutes" ? " min" : "%"}</span>
    </>
  );
}

const DIST_LABELS: [keyof Dist, string][] = [
  ["median", "Median"],
  ["p90", "P90"],
  ["sd", "Std dev"],
];

const HEADER = ["Rank", "Train", "Avg min", "Avg %", "Median", "P90", "SD", "Measured", "Cancelled", "Partly", ""];

/** Column labels for the wide (>= 1024px) layout; each card also carries its own visually-hidden labels. */
export function TrainTableHeader({ mode }: { mode: Mode }) {
  return (
    <div className={styles.thead} data-mode={mode} aria-hidden="true">
      {HEADER.map((h, i) => (
        <span key={i}>
          {h}
          {i >= 4 && i <= 6 ? <span className={styles.u}>{mode === "minutes" ? " min" : " %"}</span> : null}
        </span>
      ))}
    </div>
  );
}

interface TrainCardProps {
  train: TrainSummary;
  mode: Mode;
  rank: number;
  /** Position in the list, drives the entry stagger. */
  index: number;
}

export function TrainCard({ train: t, mode, rank, index }: TrainCardProps) {
  const minutes = (
    <p key="minutes" data-metric="minutes" className={mode === "minutes" ? styles.primary : styles.secondary}>
      <span className={styles.big}>{fmt1(t.minutes.avg)}</span>
      <span className={styles.unit}> min</span>
      <span className={styles.caption}> late on average</span>
    </p>
  );
  const percent = (
    <p key="percent" data-metric="percent" className={mode === "percent" ? styles.primary : styles.secondary}>
      <span className={styles.big}>{fmtPct(t.percent.avg)}</span>
      <span className={styles.caption}> of the journey</span>
    </p>
  );
  const dist = t[mode];

  return (
    <li
      className={styles.card}
      data-mode={mode}
      style={{ "--i": index, "--heat": delayColor(t.minutes.avg) } as React.CSSProperties}
    >
      <p className={styles.rank}>
        <span className="visually-hidden">Rank </span>
        {fmtRank(rank)}
      </p>
      <div className={styles.who}>
        <h3 className={styles.name}>
          <Link href={`/train/${t.slug}/`} className={styles.link}>
            {t.train}
          </Link>
        </h3>
        <p className={styles.route}>
          {t.origin} <span aria-hidden="true">→</span>
          <span className="visually-hidden"> to </span> {t.dest}
        </p>
        {mode === "percent" ? (
          <p className={styles.trip}>{fmtDuration(t.avgScheduledMin)} scheduled on average</p>
        ) : null}
      </div>
      <div className={styles.headline}>{mode === "minutes" ? [minutes, percent] : [percent, minutes]}</div>
      <dl className={styles.stats}>
        {DIST_LABELS.map(([k, label]) => (
          <div key={k} className={styles.stat}>
            <dt>{label}</dt>
            <dd>{distValue(dist[k], mode)}</dd>
          </div>
        ))}
        <div className={styles.stat}>
          <dt>Measured</dt>
          <dd>
            {fmtInt(mode === "minutes" ? t.measured : t.measuredPct)}
            <span className={styles.u}> runs</span>
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>Cancelled</dt>
          <dd>
            {fmt1(t.fullCancelPct)}
            <span className={styles.u}>%</span>
          </dd>
        </div>
        <div className={styles.stat}>
          <dt>Partly cancelled</dt>
          <dd>
            {fmt1(t.partialCancelPct)}
            <span className={styles.u}>%</span>
          </dd>
        </div>
      </dl>
      <span className={styles.details} aria-hidden="true">
        <span className={styles.detailsText}>Details</span> →
      </span>
    </li>
  );
}
