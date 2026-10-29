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
  const [selected, setSelected] = useState(months.length - 1);
  if (months.length === 0) return null;

  const { worst, best } = extremes(months.map((m) => m.avgDelayMin));
  const flagOf = (i: number): MonthFlag | undefined =>
    worst === best ? undefined : i === worst ? "worst" : i === best ? "best" : undefined;

  const columns: MonthColumn[] = months.map((m, i) => ({
    month: m.month,
    value: m.avgDelayMin,
    flag: flagOf(i),
    ariaLabel: `${monthLabel(m.month)}: ${fmt1(m.avgDelayMin)} min late on average, ${fmt1(m.fullCancelPct)}% cancelled${flagOf(i) ? `, ${flagOf(i)} month` : ""}`,
  }));

  const summary =
    `Average delay per month, ${monthLabel(months[0].month)} to ${monthLabel(months[months.length - 1].month)}. ` +
    `Worst month ${monthLabel(months[worst].month)} at ${fmt1(months[worst].avgDelayMin)} min, ` +
    `best ${monthLabel(months[best].month)} at ${fmt1(months[best].avgDelayMin)} min.`;

  const sel = months[Math.min(selected, months.length - 1)];

  return (
    <figure className={styles.root} aria-label={summary}>
      <MonthReadout
        month={sel.month}
        flag={flagOf(selected)}
        value={fmt1(sel.avgDelayMin)}
        unit="min"
        noun="late on average"
        sub={`${fmt1(sel.fullCancelPct)}% of trips cancelled`}
      />

      <MonthBars
        columns={columns}
        selected={selected}
        onSelect={setSelected}
        unit="min"
        format={fmt1}
        groupLabel="Average delay by month. Use arrow keys to move between months."
      />

      <p className={styles.hint} aria-hidden="true">
        Tap a bar to see that month.
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
