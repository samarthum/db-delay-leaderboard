"use client";

import { useState } from "react";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import type { MonthPoint } from "@/lib/types";
import { MonthBars, MonthReadout, type MonthColumn, type MonthFlag } from "./MonthBars";
import styles from "./MonthlyChart.module.css";

export interface MonthlyChartProps {
  /** One point per window month, ascending. */
  months: MonthPoint[];
}

type Metric = "delay" | "cancel";

/** Each view is one measure on one axis; the readout always carries both numbers. */
const METRICS: Record<
  Metric,
  { tab: string; unit: string; noun: string; value: (m: MonthPoint) => number; short: (m: MonthPoint) => string }
> = {
  delay: {
    tab: "Avg delay",
    unit: "min",
    noun: "average delay at the last German stop",
    value: (m) => m.avgDelayMin,
    short: (m) => `${fmt1(m.avgDelayMin)} min average delay`,
  },
  cancel: {
    tab: "Cancelled",
    unit: "%",
    noun: "of runs fully cancelled",
    value: (m) => m.fullCancelPct,
    short: (m) => `${fmt1(m.fullCancelPct)}% fully cancelled`,
  },
};

const METRIC_ORDER: Metric[] = ["delay", "cancel"];

/** Index of the highest and lowest value; first occurrence wins a tie. */
export function extremes(values: number[]): { worst: number; best: number } {
  let worst = 0;
  let best = 0;
  values.forEach((v, i) => {
    if (v > values[worst]) worst = i;
    if (v < values[best]) best = i;
  });
  return { worst, best };
}

export function MonthlyChart({ months }: MonthlyChartProps) {
  const [metric, setMetric] = useState<Metric>("delay");
  const [selected, setSelected] = useState(months.length - 1);
  if (months.length === 0) return null;

  const spec = METRICS[metric];
  const values = months.map(spec.value);
  const { worst, best } = extremes(values);
  const flagOf = (i: number): MonthFlag | undefined =>
    worst === best ? undefined : i === worst ? "worst" : i === best ? "best" : undefined;

  const columns: MonthColumn[] = months.map((m, i) => ({
    month: m.month,
    value: values[i],
    flag: flagOf(i),
    ariaLabel: `${monthLabel(m.month)}: ${METRICS.delay.short(m)}, ${METRICS.cancel.short(m)}${flagOf(i) ? `, ${flagOf(i)} month` : ""}`,
  }));

  const delayExt = extremes(months.map(METRICS.delay.value));
  const first = months[0];
  const last = months[months.length - 1];
  const summary =
    `Average delay and full cancellations per month, ${monthLabel(first.month)} to ${monthLabel(last.month)}. ` +
    `Worst month ${monthLabel(months[delayExt.worst].month)} at ${fmt1(months[delayExt.worst].avgDelayMin)} min, ` +
    `best ${monthLabel(months[delayExt.best].month)} at ${fmt1(months[delayExt.best].avgDelayMin)} min.`;

  const sel = months[Math.min(selected, months.length - 1)];
  const other: Metric = metric === "delay" ? "cancel" : "delay";

  return (
    <figure className={styles.root} aria-label={summary}>
      <div className={styles.switch} role="group" aria-label="Metric">
        {METRIC_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            className={styles.seg}
            aria-pressed={metric === k}
            onClick={() => setMetric(k)}
          >
            {METRICS[k].tab}
          </button>
        ))}
      </div>

      <MonthReadout
        month={sel.month}
        flag={flagOf(selected)}
        value={fmt1(spec.value(sel))}
        unit={spec.unit}
        noun={spec.noun}
        sub={`${METRICS[other].short(sel)} · ${fmtInt(sel.runs)} runs`}
      />

      <MonthBars
        columns={columns}
        selected={selected}
        onSelect={setSelected}
        unit={spec.unit}
        format={fmt1}
        groupLabel={`${spec.tab} by month. Use arrow keys to move between months.`}
      />

      <p className={styles.hint} aria-hidden="true">
        Tap or drag across the bars for exact values.
      </p>

      <table className="visually-hidden">
        <caption>Long-distance trains per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Average delay (min)</th>
            <th scope="col">Median delay (min)</th>
            <th scope="col">Fully cancelled (%)</th>
            <th scope="col">Runs</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td>{fmt1(m.avgDelayMin)}</td>
              <td>{fmt1(m.medianDelayMin)}</td>
              <td>{fmt1(m.fullCancelPct)}</td>
              <td>{fmtInt(m.runs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
