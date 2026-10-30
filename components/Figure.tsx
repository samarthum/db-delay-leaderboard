import type { ReactNode } from "react";
import { fmtShare, fmtShare1, fmtInt } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";

/**
 * The answer a page opens with: one big number, what it counts, and the same share by Deutsche Bahn's own
 * 6-minute rule as a second bar on the same 0 to 100 scale. The basis sits directly under it.
 */
export function Figure({
  pct,
  pct6,
  sentence,
  basis,
  lang,
  decimals = false,
}: {
  pct: number;
  pct6: number | null;
  /** "of trips arrive <strong>15 minutes or more</strong> late at Berlin Hbf." */
  sentence: ReactNode;
  basis: string;
  lang: Lang;
  decimals?: boolean;
}) {
  const t = makeT(lang);
  const show = (v: number) => (decimals ? fmtShare1(v, lang) : fmtShare(v, lang));
  return (
    <div className="fig">
      <div className="figrow">
        <span className="big num">
          {Math.round(pct)}
          <span className="u">%</span>
        </span>
        <p className="figtext">{sentence}</p>
      </div>
      <div className="rules">
        <RuleBar label={t("rule.ours")} small={t("rule.ours15")} value={pct} text={show(pct)} />
        {pct6 !== null ? <RuleBar label={t("rule.db")} small={t("rule.db6")} value={pct6} text={show(pct6)} db /> : null}
      </div>
      <p className="basis" style={{ marginTop: 10 }}>
        {basis}
      </p>
    </div>
  );
}

function RuleBar({ label, small, value, text, db = false }: { label: string; small: string; value: number; text: string; db?: boolean }) {
  return (
    <div className="rb">
      <span className="rb-l">
        {label} <small>{small}</small>
      </span>
      <span className="rb-t" aria-hidden="true">
        <i className={db ? "db" : ""} style={{ width: `${Math.max(0.8, Math.min(100, value))}%` }} />
      </span>
      <span className="rb-v">{text}</span>
    </div>
  );
}

export { fmtInt };
