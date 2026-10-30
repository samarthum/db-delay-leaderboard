import { fmt1, fmtShare, fmtShare1 } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { delayColor, lateShareColor } from "@/lib/colors";

const esc = (s: string) => s.replace(/&/g, "&amp;");

export interface StopPoint {
  name: string;
  value: number;
}

/**
 * Stop by stop, drawn vertically: names down the left, the line plotted across, the value on the right.
 * The biggest jump is shaded and named in the heading above. Every figure is also text, so nothing needs the colour.
 */
export function StopLine({
  points,
  lang,
  unit,
  xmax,
  jump,
  label,
  rowh = 30,
  labelW = 150,
  width = 350,
}: {
  points: StopPoint[];
  lang: Lang;
  /** "pct": share of trips 15+ min late; "min": average minutes late. */
  unit: "pct" | "min";
  xmax: number;
  /** Index i: the step from points[i-1] to points[i] is shaded. */
  jump?: number | null;
  /** Accessible description of the whole chart. */
  label: string;
  rowh?: number;
  labelW?: number;
  width?: number;
}) {
  const n = points.length;
  const top = 26;
  const h = top + n * rowh + 4;
  const px0 = labelW + 6;
  const px1 = width - 52;
  const X = (v: number) => px0 + ((px1 - px0) * Math.max(0, Math.min(v, xmax))) / xmax;
  const Y = (i: number) => top + i * rowh + rowh / 2;
  const step = xmax >= 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = 0; t <= xmax; t += step) ticks.push(t);
  const col = (v: number) => (unit === "pct" ? lateShareColor(v) : delayColor(v));
  const val = (v: number) => (unit === "pct" ? fmtShare1(v, lang) : fmt1(v, lang));
  const poly = points.map((p, i) => `${X(p.value).toFixed(1)},${Y(i).toFixed(1)}`).join(" ");
  return (
    <figure className="sl">
      <svg viewBox={`0 0 ${width} ${h}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} y1={top - 4} x2={X(t)} y2={h - 2} stroke="#E3E5E8" />
            <text className="ax" x={X(t)} y={top - 10} textAnchor="middle">
              {unit === "pct" ? fmtShare(t, lang) : t}
            </text>
          </g>
        ))}
        {unit === "min" ? (
          <text className="ax" x={width} y={top - 10} textAnchor="end">
            {lang === "de" ? "Min." : "min"}
          </text>
        ) : null}
        {jump != null && jump > 0 ? <rect x={0} y={Y(jump - 1) - rowh / 2 + 2} width={width} height={Y(jump) - Y(jump - 1) + rowh - 4} fill="#EEF0F2" /> : null}
        {points.map((_, i) => (
          <line key={i} x1={0} x2={width} y1={top + (i + 1) * rowh} y2={top + (i + 1) * rowh} stroke="#ECEEF0" />
        ))}
        <polyline points={poly} fill="none" stroke="#14161A" strokeWidth={2} />
        {points.map((p, i) => {
          const edge = i === 0 || i === n - 1;
          return (
            <g key={`${p.name}-${i}`}>
              <circle cx={X(p.value)} cy={Y(i)} r={edge ? 6 : 5} fill={col(p.value)} stroke="#FAFAF8" strokeWidth={2} />
              <text x={0} y={Y(i) + 5} fontWeight={edge ? 600 : undefined}>
                {esc(p.name)}
              </text>
              <text className="val" x={width} y={Y(i) + 5} textAnchor="end">
                {val(p.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export interface Column {
  label: string;
  value: number | null;
  color?: string;
}

/** Small vertical columns with the label under each. Optional dashed threshold between two columns and a dashed reference line. */
export function Columns({
  items,
  label,
  lang,
  unit,
  ymax,
  threshold,
  thresholdLabel,
  reference,
  height = 170,
  width = 350,
  gap = 6,
  showValues = true,
}: {
  items: Column[];
  label: string;
  lang: Lang;
  unit: "pct" | "min";
  ymax?: number;
  /** Index of the first column right of the threshold line. */
  threshold?: number;
  thresholdLabel?: string;
  /** A dashed reference line, one value per column (the network average). */
  reference?: (number | null)[];
  height?: number;
  width?: number;
  gap?: number;
  showValues?: boolean;
}) {
  const n = items.length;
  const top = 22;
  const bot = 34;
  const ph = height - top - bot;
  const all = [...items.map((i) => i.value), ...(reference ?? [])].filter((v): v is number => v !== null);
  const max = ymax ?? Math.max(...all, 1) * 1.12;
  const cw = (width - gap * (n - 1)) / n;
  const fmt = (v: number) => (unit === "pct" ? fmtShare(v, lang) : String(Math.round(v)));
  const refPts = reference
    ?.map((r, i) => (r === null ? null : `${(i * (cw + gap) + cw / 2).toFixed(1)},${(top + ph - (ph * r) / max).toFixed(1)}`))
    .filter(Boolean)
    .join(" ");
  const tx = threshold != null ? threshold * (cw + gap) - gap / 2 : 0;
  return (
    <figure className="cols">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <line x1={0} x2={width} y1={top + ph} y2={top + ph} stroke="#14161A" />
        {items.map((it, i) => {
          const x = i * (cw + gap);
          return (
            <g key={i}>
              {it.value === null ? (
                <text x={x + cw / 2} y={top + ph - 6} textAnchor="middle" fill="#5E656F">
                  –
                </text>
              ) : (
                <>
                  <rect x={x} y={top + ph - (ph * it.value) / max} width={cw} height={(ph * it.value) / max} fill={it.color ?? "#14161A"} />
                  {showValues ? (
                    <text className="lab" x={x + cw / 2} y={top + ph - (ph * it.value) / max - 6} textAnchor="middle">
                      {fmt(it.value)}
                    </text>
                  ) : null}
                </>
              )}
              <text x={x + cw / 2} y={top + ph + 18} textAnchor="middle">
                {it.label}
              </text>
            </g>
          );
        })}
        {threshold != null ? (
          <g>
            <line x1={tx} x2={tx} y1={top - 14} y2={top + ph + 4} stroke="#14161A" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={tx + 6} y={top - 6} fill="#14161A" fontWeight={600} className="lab">
              {thresholdLabel}
            </text>
          </g>
        ) : null}
        {refPts ? <polyline points={refPts} fill="none" stroke="#5E656F" strokeWidth={2} strokeDasharray="5 4" /> : null}
      </svg>
    </figure>
  );
}
