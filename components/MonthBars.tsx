"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { useArmedUntilInView } from "@/hooks/useInView";
import { monthLabel, monthShort } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import styles from "./MonthBars.module.css";

export type MonthFlag = "worst" | "best";

export interface MonthColumn {
  /** "YYYY-MM" */
  month: string;
  /** null = nothing measured; drawn as an explicit "no data" stub, never as zero. */
  value: number | null;
  fill?: string;
  flag?: MonthFlag;
  /** Reference value for this month (e.g. network average), drawn as a dashed tick. */
  refValue?: number | null;
  /** Full spoken description of the column. */
  ariaLabel: string;
}

export interface MonthBarsProps {
  columns: MonthColumn[];
  selected: number;
  onSelect: (index: number) => void;
  /** Axis unit shown above the tick labels, e.g. "min" or "%". */
  unit: string;
  format: (v: number) => string;
  groupLabel: string;
  size?: "md" | "sm";
  lang?: Lang;
}

export interface MonthReadoutProps {
  /** "YYYY-MM" */
  month: string;
  flag?: MonthFlag;
  /** Pre-formatted headline value, e.g. "17.9" or "–". */
  value: string;
  unit?: string;
  noun: string;
  sub?: string;
  size?: "md" | "sm";
  lang?: Lang;
}

/** Departure-board panel above a month chart that spells out the selected month. */
export function MonthReadout({ month, flag, value, unit, noun, sub, size = "md", lang = "en" }: MonthReadoutProps) {
  const t = makeT(lang);
  return (
    <div className={`${styles.readout} ${size === "sm" ? styles.readoutSm : ""}`} aria-live="polite">
      <div className={styles.readoutTop}>
        <span className={styles.readoutMonth}>{monthLabel(month, lang)}</span>
        {flag && (
          <span className={styles.badge} data-flag={flag}>
            {flag === "worst" ? t("chart.worstMonth") : t("chart.bestMonth")}
          </span>
        )}
      </div>
      <p className={styles.big}>
        {value}
        {unit && <span className={styles.bigUnit}>{unit}</span>}
      </p>
      <p className={styles.noun}>{noun}</p>
      {sub && <p className={styles.sub}>{sub}</p>}
    </div>
  );
}

/** 2 to 4 round gridlines below the data max: the step whose tick count is closest to 3. */
export function niceTicks(max: number): { ticks: number[]; domain: number } {
  const safeMax = max > 0 ? max : 1;
  const pow = 10 ** Math.floor(Math.log10(safeMax / 3));
  let best = pow;
  let bestScore = Infinity;
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    const step = m * pow;
    const score = Math.abs(Math.floor(safeMax / step) - 3);
    if (score <= bestScore) {
      best = step;
      bestScore = score;
    }
  }
  const domain = Math.max(safeMax * 1.06, best);
  const ticks: number[] = [];
  for (let t = 0; t <= domain + 1e-9; t += best) ticks.push(Math.round(t * 100) / 100);
  return { ticks, domain };
}

function flagAlign(columns: MonthColumn[], i: number): "center" | "start" | "end" {
  const n = columns.length;
  if (i === 0) return "start";
  if (i === n - 1) return "end";
  if (columns[i - 1]?.flag) return "start";
  if (columns[i + 1]?.flag) return "end";
  return "center";
}

export function MonthBars({ columns, selected, onSelect, unit, format, groupLabel, size = "md", lang = "en" }: MonthBarsProps) {
  const t = makeT(lang);
  const [rootRef, armed] = useArmedUntilInView<HTMLDivElement>();
  const colsRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const n = columns.length;

  const values = columns.flatMap((c) => [c.value, c.refValue]).filter((v): v is number => v != null);
  const { ticks, domain } = niceTicks(Math.max(0, ...values));
  const pct = (v: number) => `${(Math.max(0, v) / domain) * 100}%`;

  const pick = (clientX: number) => {
    const el = colsRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const i = Math.min(n - 1, Math.max(0, Math.floor(((clientX - r.left) / r.width) * n)));
    if (i !== selected) onSelect(i);
  };

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown" || e.pointerType === "mouse" || e.buttons) pick(e.clientX);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowRight" ? selected + 1
      : e.key === "ArrowLeft" ? selected - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const i = Math.min(n - 1, Math.max(0, next));
    onSelect(i);
    buttons.current[i]?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${size === "sm" ? styles.sm : ""}`}
      data-reveal={armed ? "pending" : undefined}
    >
      <div className={styles.axis} aria-hidden="true">
        <span className={styles.unit}>{unit}</span>
        {ticks.map((t) => (
          <span key={t} className={styles.tick} style={{ bottom: pct(t) }}>
            {format(t).replace(/[.,]0$/, "")}
          </span>
        ))}
      </div>
      <div className={styles.plot}>
        <div className={styles.grid} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className={t === 0 ? styles.baseline : styles.gridline} style={{ bottom: pct(t) }} />
          ))}
        </div>
        <div
          ref={colsRef}
          className={styles.cols}
          role="group"
          aria-label={groupLabel}
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onKeyDown={onKeyDown}
        >
          {columns.map((c, i) => {
            const newYear = i === 0 || c.month.endsWith("-01");
            return (
              <button
                key={c.month}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                className={styles.col}
                data-selected={i === selected || undefined}
                data-year-start={(i > 0 && newYear) || undefined}
                aria-pressed={i === selected}
                aria-label={c.ariaLabel}
                tabIndex={i === selected ? 0 : -1}
                onClick={() => onSelect(i)}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className={styles.track}>
                  {c.value === null ? (
                    <span className={styles.nodata} />
                  ) : (
                    <span
                      className={styles.bar}
                      data-flag={c.flag}
                      style={{ height: pct(c.value), background: c.fill }}
                    />
                  )}
                  {c.refValue != null && <span className={styles.ref} style={{ bottom: pct(c.refValue) }} />}
                  {c.flag && c.value !== null && (
                    <>
                      <span className={styles.leader} data-flag={c.flag} style={{ bottom: pct(c.value) }} />
                      <span className={styles.chip} data-flag={c.flag} data-align={flagAlign(columns, i)}>
                        <span className={styles.chipLabel}>{c.flag === "worst" ? t("chart.worst") : t("chart.best")}</span>
                        <span className={styles.chipValue}>{format(c.value)}</span>
                      </span>
                    </>
                  )}
                </span>
                <span className={styles.x}>
                  <span className={styles.month}>{monthShort(c.month, lang)}</span>
                  {newYear && <span className={styles.year}>{c.month.slice(0, 4)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
