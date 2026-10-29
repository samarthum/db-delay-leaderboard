"use client";

import { useState } from "react";
import { fmt1, fmtInt, fmtShare1, monthLabel } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import type { Category, MonthPoint } from "@/lib/types";
import { MonthBars, MonthReadout, type MonthColumn, type MonthFlag } from "./MonthBars";
import { Toggle } from "./Toggle";
import { categoryCopy } from "./pageFormat";
import styles from "./MonthlyChart.module.css";

export interface MonthlyChartProps {
  /** One point per window month per category, ascending. */
  series: Record<Category, MonthPoint[]>;
  lang: Lang;
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

export function MonthlyChart({ series, lang }: MonthlyChartProps) {
  const t = makeT(lang);
  const [category, setCategory] = useState<Category>("longDistance");
  const months = series[category];
  const [selected, setSelected] = useState(months.length - 1);
  if (months.length === 0) return null;

  const { worst, best } = extremes(months.map((m) => m.avgDelayMin));
  const flagOf = (i: number): MonthFlag | undefined => (worst === best ? undefined : i === worst ? "worst" : i === best ? "best" : undefined);
  const copy = categoryCopy(lang, category);

  const columns: MonthColumn[] = months.map((m, i) => ({
    month: m.month,
    value: m.avgDelayMin,
    flag: flagOf(i),
    ariaLabel: t("network.monthly.row", {
      month: monthLabel(m.month, lang),
      avg: fmt1(m.avgDelayMin, lang),
      canc: fmtShare1(m.fullCancelPct, lang),
      flag: flagOf(i) === "worst" ? t("network.monthly.flagWorst") : flagOf(i) === "best" ? t("network.monthly.flagBest") : "",
    }),
  }));

  const sel = months[Math.min(selected, months.length - 1)];

  return (
    <div className={styles.root}>
      <Toggle
        label={t("network.monthly.show")}
        idPrefix="monthly"
        value={category}
        onChange={setCategory}
        options={[
          { value: "longDistance", label: categoryCopy(lang, "longDistance").tab },
          { value: "regional", label: categoryCopy(lang, "regional").tab },
        ]}
      />
      <p className={styles.summary}>
        {t("network.monthly.summary", {
          plural: copy.plural,
          worstMonth: monthLabel(months[worst].month, lang),
          worstVal: fmt1(months[worst].avgDelayMin, lang),
          bestMonth: monthLabel(months[best].month, lang),
          bestVal: fmt1(months[best].avgDelayMin, lang),
        })}
      </p>

      <figure className={styles.card} aria-label={t("network.monthly.aria", { plural: copy.plural })}>
        <MonthReadout
          lang={lang}
          month={sel.month}
          flag={flagOf(selected)}
          value={fmt1(sel.avgDelayMin, lang)}
          unit={t("unit.min")}
          noun={t("network.monthly.noun")}
          sub={t("network.monthly.cancelled", { pct: fmtShare1(sel.fullCancelPct, lang) })}
        />

        <MonthBars
          lang={lang}
          columns={columns}
          selected={selected}
          onSelect={setSelected}
          unit={t("unit.min")}
          format={(v) => fmt1(v, lang)}
          groupLabel={t("network.monthly.group")}
        />

        <p className={styles.hint} aria-hidden="true">
          {t("network.monthly.hint")}
        </p>

        <table className="visually-hidden">
          <caption>{t("network.monthly.tableCaption", { cat: copy.tab })}</caption>
          <thead>
            <tr>
              <th scope="col">{t("network.monthly.colMonth")}</th>
              <th scope="col">{t("network.monthly.colAvg")}</th>
              <th scope="col">{t("network.monthly.colMedian")}</th>
              <th scope="col">{t("network.monthly.colCanc")}</th>
              <th scope="col">{t("network.monthly.colRuns")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month}>
                <th scope="row">{monthLabel(m.month, lang)}</th>
                <td>{fmt1(m.avgDelayMin, lang)}</td>
                <td>{fmt1(m.medianDelayMin, lang)}</td>
                <td>{fmt1(m.fullCancelPct, lang)}</td>
                <td>{fmtInt(m.runs, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </div>
  );
}
