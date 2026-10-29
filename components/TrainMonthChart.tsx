"use client";

import { useState } from "react";
import { delayColor } from "@/lib/colors";
import { fmt1, fmtInt, monthLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import type { MonthAvg } from "@/lib/types";
import { MonthBars, MonthReadout, type MonthColumn, type MonthFlag } from "./MonthBars";
import styles from "./TrainMonthChart.module.css";

export interface TrainMonthChartProps {
  monthly: MonthAvg[];
  /** Network-wide average per month, drawn as a reference line when given. */
  networkAvg?: { month: string; avg: number }[];
  /** What the reference line averages, e.g. "All regional lines". */
  networkLabel: string;
  lang: Lang;
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

export function TrainMonthChart({ monthly, networkAvg, networkLabel, lang }: TrainMonthChartProps) {
  const t = makeT(lang);
  const [selected, setSelected] = useState(() => lastMeasured(monthly));
  if (monthly.length === 0) return null;

  const network = new Map(networkAvg?.map((n) => [n.month, n.avg]));
  const flags = flagsFor(monthly);
  const hasGap = monthly.some((m) => m.avg === null);

  const flagText = (f: MonthFlag | undefined) => (f === "worst" ? t("tmc.flagWorst") : f === "best" ? t("tmc.flagBest") : "");

  const describe = (m: MonthAvg) => {
    const net = network.get(m.month);
    const head = m.avg === null ? t("tmc.row.none") : t("tmc.row.some", { avg: fmt1(m.avg, lang), n: fmtInt(m.runs, lang) });
    return net === undefined ? head : t("tmc.row.net", { head, net: fmt1(net, lang) });
  };

  const columns: MonthColumn[] = monthly.map((m, i) => ({
    month: m.month,
    value: m.avg,
    fill: m.avg === null ? undefined : delayColor(m.avg),
    flag: flags.get(i),
    refValue: network.get(m.month) ?? null,
    ariaLabel: `${monthLabel(m.month, lang)}: ${describe(m)}${flagText(flags.get(i))}`,
  }));

  const sel = monthly[Math.min(selected, monthly.length - 1)];
  const selNet = network.get(sel.month);
  const sub = [
    sel.avg === null ? null : t("tmc.trips", { n: fmtInt(sel.runs, lang) }),
    selNet === undefined ? null : `${networkLabel} ${fmt1(selNet, lang)} ${t("unit.min")}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const measured = monthly.filter((m) => m.avg !== null).length;
  const summary = t("tmc.summary", {
    span: `${monthLabel(monthly[0].month, lang)} ${lang === "de" ? "bis" : "to"} ${monthLabel(monthly[monthly.length - 1].month, lang)}`,
    m: measured,
    total: monthly.length,
  });

  return (
    <figure className={styles.root} aria-label={summary}>
      <MonthReadout
        lang={lang}
        size="sm"
        month={sel.month}
        flag={flags.get(selected)}
        value={sel.avg === null ? "–" : fmt1(sel.avg, lang)}
        unit={sel.avg === null ? undefined : t("unit.min")}
        noun={sel.avg === null ? t("tmc.noTrips") : t("tmc.noun")}
        sub={sub || undefined}
      />

      <MonthBars
        lang={lang}
        size="sm"
        columns={columns}
        selected={selected}
        onSelect={setSelected}
        unit={t("unit.min")}
        format={(v) => fmt1(v, lang)}
        groupLabel={t("network.monthly.group")}
      />

      {(networkAvg || hasGap) && (
        <ul className={styles.legend} aria-hidden="true">
          {networkAvg && (
            <li>
              <span className={styles.keyRef} />
              {networkLabel}
            </li>
          )}
          {hasGap && (
            <li>
              <span className={styles.keyGap} />
              {t("tmc.legendNone")}
            </li>
          )}
        </ul>
      )}

      <table className="visually-hidden">
        <caption>{t("tmc.table")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("tmc.colMonth")}</th>
            <th scope="col">{t("tmc.colAvg")}</th>
            <th scope="col">{t("tmc.colRuns")}</th>
            {networkAvg && <th scope="col">{t("tmc.colNet")}</th>}
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">{monthLabel(m.month, lang)}</th>
              <td>{m.avg === null ? t("tmc.row.none") : fmt1(m.avg, lang)}</td>
              <td>{fmtInt(m.runs, lang)}</td>
              {networkAvg && <td>{network.has(m.month) ? fmt1(network.get(m.month)!, lang) : t("tmc.na")}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
