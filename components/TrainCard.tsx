import Link from "next/link";
import type { Mode, TrainSummary } from "@/lib/types";
import { fmt1, fmtPct } from "@/lib/format";
import { delayColor } from "@/lib/colors";
import { fmtDuration, fmtRank, trainKind } from "./pageFormat";
import styles from "./TrainCard.module.css";

const HEADER = ["Rank", "Train", "Min late", "% of trip", "1 in 10 trips", "Cancelled", ""];

/** Column labels for the wide (>= 1024px) layout; each card also carries its own visually-hidden labels. */
export function TrainTableHeader({ mode }: { mode: Mode }) {
  return (
    <div className={styles.thead} data-mode={mode} aria-hidden="true">
      {HEADER.map((h, i) => (
        <span key={i}>{h}</span>
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
  // Rounded down so "N+" never overstates the 90th percentile.
  const p90 = Math.floor(t.minutes.p90);

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
        <p className={styles.trip}>
          {trainKind(t.type)}
          {mode === "percent" ? ` · ${fmtDuration(t.avgScheduledMin)} trip` : null}
          {t.alsoRunsAs.length > 0 ? ` · also runs as ${t.alsoRunsAs.join(", ")}` : null}
        </p>
      </div>
      <div className={styles.headline}>{mode === "minutes" ? [minutes, percent] : [percent, minutes]}</div>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>1 in 10 trips</dt>
          <dd>{p90}+ min late</dd>
        </div>
        <div className={styles.stat}>
          <dt>Cancelled</dt>
          <dd>{fmt1(t.fullCancelPct)}%</dd>
        </div>
      </dl>
      <span className={styles.details} aria-hidden="true">
        <span className={styles.detailsText}>Details</span> →
      </span>
    </li>
  );
}
