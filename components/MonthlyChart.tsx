"use client";

import { useState } from "react";
import { fmt1, fmtInt, fmtShare1, monthLabel, monthShort } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import type { Category, MonthPoint } from "@/lib/types";
import { Columns } from "./charts";
import { categoryCopy } from "./pageFormat";

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

/** Average delay per month for long-distance trains or regional trains. Every figure is also in the table below it. */
export function MonthlyChart({ series, lang }: MonthlyChartProps) {
  const t = makeT(lang);
  const [category, setCategory] = useState<Category>("longDistance");
  const months = series[category];
  if (months.length === 0) return null;
  const { worst, best } = extremes(months.map((m) => m.avgDelayMin));
  const copy = categoryCopy(lang, category);
  const cats: Category[] = ["longDistance", "regional"];

  return (
    <div>
      <p className="seglabel" id="monthly-show">
        {t("network.monthly.show")}
      </p>
      <div className="seg c2" role="group" aria-labelledby="monthly-show">
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
            {categoryCopy(lang, c).tab}
          </button>
        ))}
      </div>
      <p className="sec-sub" style={{ marginTop: 14 }}>
        {t("network.monthly.summary", {
          plural: copy.plural,
          worstMonth: monthLabel(months[worst].month, lang),
          worstVal: fmt1(months[worst].avgDelayMin, lang),
          bestMonth: monthLabel(months[best].month, lang),
          bestVal: fmt1(months[best].avgDelayMin, lang),
        })}
      </p>
      <Columns
        items={months.map((m, i) => ({ label: monthShort(m.month, lang).charAt(0), value: m.avgDelayMin, color: i === worst ? "#14161A" : "#9AA0A8" }))}
        lang={lang}
        unit="min"
        height={210}
        gap={5}
        label={t("network.monthly.aria", { plural: copy.plural })}
      />
      <details className="disc">
        <summary>{t("network.monthly.tableCaption", { cat: copy.tab })}</summary>
        <table className="bt">
          <thead>
            <tr>
              <th scope="col">{t("network.monthly.colMonth")}</th>
              <th scope="col" className="r">{t("network.monthly.colAvg")}</th>
              <th scope="col" className="r">{t("network.monthly.colCanc")}</th>
              <th scope="col" className="r">{t("network.monthly.colRuns")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="ro">
                <th scope="row" style={{ fontWeight: 600 }}>{monthLabel(m.month, lang)}</th>
                <td className="v">{fmt1(m.avgDelayMin, lang)}</td>
                <td className="v">{fmtShare1(m.fullCancelPct, lang)}</td>
                <td className="v">{fmtInt(m.runs, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
