"use client";

import { useState } from "react";
import { delayColor } from "@/lib/colors";
import { fmt1, monthLabel } from "@/lib/format";
import type { MonthAvg } from "@/lib/types";
import { MonthBars, MonthReadout, type MonthColumn, type MonthFlag } from "./MonthBars";
import styles from "./TrainMonthChart.module.css";

export interface TrainMonthChartProps {
  monthly: MonthAvg[];
  /** Network-wide average per month, drawn as a reference line when given. */
  networkAvg?: { month: string; avg: number }[];
}

/** Worst and best among measured months; skipped when fewer than three months have data. */
function flagsFor(monthly: MonthAvg[]): Map<number, MonthFlag> {
  const measured = monthly.flatMap((m, i) => (m.avg === null ? [] : [{ i, avg: m.avg }]));
  const flags = new Map<number, MonthFlag>();
  if (measured.length < 3) return flags;
  const worst = measured.reduce((a, b) => (b.avg > a.avg ? b : a));
  const best = measured.reduce((a, b) => (b.avg < a.avg ? b : a));
  if (worst.i === best.i) return flags;
  flags.set(worst.i, "worst");
  flags.set(best.i, "best");
  return flags;
}

function lastMeasured(monthly: MonthAvg[]): number {
  for (let i = monthly.length - 1; i >= 0; i--) if (monthly[i].avg !== null) return i;
  return monthly.length - 1;
}

export function TrainMonthChart({ monthly, networkAvg }: TrainMonthChartProps) {
  const [selected, setSelected] = useState(() => lastMeasured(monthly));
  if (monthly.length === 0) return null;

  const network = new Map(networkAvg?.map((n) => [n.month, n.avg]));
  const flags = flagsFor(monthly);
  const hasGap = monthly.some((m) => m.avg === null);

  const describe = (m: MonthAvg) => {
    const net = network.get(m.month);
    const head = m.avg === null ? "no measured run" : `${fmt1(m.avg)} min average delay over ${m.runs} runs`;
    return net === undefined ? head : `${head}; network average ${fmt1(net)} min`;
  };

  const columns: MonthColumn[] = monthly.map((m, i) => ({
    month: m.month,
    value: m.avg,
    fill: m.avg === null ? undefined : delayColor(m.avg),
    flag: flags.get(i),
    refValue: network.get(m.month) ?? null,
    ariaLabel: `${monthLabel(m.month)}: ${describe(m)}${flags.get(i) ? `, ${flags.get(i)} month` : ""}`,
  }));

  const sel = monthly[Math.min(selected, monthly.length - 1)];
  const selNet = network.get(sel.month);
  const sub = [
    sel.avg === null ? null : `${sel.runs} trips`,
    selNet === undefined ? null : `all trains ${fmt1(selNet)} min`,
  ]
    .filter(Boolean)
    .join(" · ");

  const measured = monthly.filter((m) => m.avg !== null).length;
  const summary =
    `Average delay of this train per month, ${monthLabel(monthly[0].month)} to ${monthLabel(monthly[monthly.length - 1].month)}, ` +
    `${measured} of ${monthly.length} months with measured runs.`;

  return (
    <figure className={styles.root} aria-label={summary}>
      <MonthReadout
        size="sm"
        month={sel.month}
        flag={flags.get(selected)}
        value={sel.avg === null ? "–" : fmt1(sel.avg)}
        unit={sel.avg === null ? undefined : "min"}
        noun={sel.avg === null ? "No trips measured this month" : "late on average"}
        sub={sub || undefined}
      />

      <MonthBars
        size="sm"
        columns={columns}
        selected={selected}
        onSelect={setSelected}
        unit="min"
        format={fmt1}
        groupLabel="Average delay by month. Use arrow keys to move between months."
      />

      {(networkAvg || hasGap) && (
        <ul className={styles.legend} aria-hidden="true">
          {networkAvg && (
            <li>
              <span className={styles.keyRef} />
              All trains
            </li>
          )}
          {hasGap && (
            <li>
              <span className={styles.keyGap} />
              No trips measured
            </li>
          )}
        </ul>
      )}

      <table className="visually-hidden">
        <caption>Average delay per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Average delay (min)</th>
            <th scope="col">Runs</th>
            {networkAvg && <th scope="col">Network average (min)</th>}
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month)}</th>
              <td>{m.avg === null ? "no measured run" : fmt1(m.avg)}</td>
              <td>{m.runs}</td>
              {networkAvg && <td>{network.has(m.month) ? fmt1(network.get(m.month)!) : "n/a"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
