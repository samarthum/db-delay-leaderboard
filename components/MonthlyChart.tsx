"use client";

import { useState } from "react";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import type { Category, MonthPoint } from "@/lib/types";
import { MonthBars, MonthReadout, type MonthColumn, type MonthFlag } from "./MonthBars";
import { Toggle } from "./Toggle";
import { CATEGORY_COPY } from "./pageFormat";
import styles from "./MonthlyChart.module.css";

export interface MonthlyChartProps {
  /** One point per window month per category, ascending. */
  series: Record<Category, MonthPoint[]>;
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

export function MonthlyChart({ series }: MonthlyChartProps) {
  const [category, setCategory] = useState<Category>("longDistance");
  const months = series[category];
  const [selected, setSelected] = useState(months.length - 1);
  if (months.length === 0) return null;

  const { worst, best } = extremes(months.map((m) => m.avgDelayMin));
  const flagOf = (i: number): MonthFlag | undefined =>
    worst === best ? undefined : i === worst ? "worst" : i === best ? "best" : undefined;
  const plural = CATEGORY_COPY[category].plural;

  const columns: MonthColumn[] = months.map((m, i) => ({
    month: m.month,
    value: m.avgDelayMin,
    flag: flagOf(i),
    ariaLabel: `${monthLabel(m.month)}: ${fmt1(m.avgDelayMin)} min late on average, ${fmt1(m.fullCancelPct)}% cancelled${flagOf(i) ? `, ${flagOf(i)} month` : ""}`,
  }));

  const sel = months[Math.min(selected, months.length - 1)];

  return (
    <div className={styles.root}>
      <Toggle
        label="Show"
        idPrefix="monthly"
        value={category}
        onChange={setCategory}
        options={[
          { value: "longDistance", label: CATEGORY_COPY.longDistance.tab },
          { value: "regional", label: CATEGORY_COPY.regional.tab },
        ]}
      />
      <p className={styles.summary}>
        All {plural}, average minutes late. The worst month was {monthLabel(months[worst].month)} (
        {fmt1(months[worst].avgDelayMin)} min), the best was {monthLabel(months[best].month)} (
        {fmt1(months[best].avgDelayMin)} min).
      </p>

      <figure className={styles.card} aria-label={`Average delay of ${plural} per month`}>
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
          <caption>{CATEGORY_COPY[category].tab} trains per month</caption>
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
    </div>
  );
}
