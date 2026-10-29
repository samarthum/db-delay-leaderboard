import { lateShareColor } from "@/lib/colors";
import { fmtInt, fmtShare1, fractionText, simpleFraction } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import { SplitFlap } from "./SplitFlap";
import styles from "./LateLead.module.css";

/**
 * The one number every result leads with: the share of trips that arrive 15 or more minutes late.
 * Split-flap tiles for the whole percent, then a plain sentence, a plain fraction and the exact basis.
 */
export function LateLead({
  pct,
  measured,
  lang,
  size = "xl",
  basis,
  rest,
}: {
  pct: number;
  measured?: number;
  lang: Lang;
  size?: "lg" | "xl";
  /** An extra line of context under the number, e.g. the data window. */
  basis?: string;
  /** Replaces "of trips arrive 15+ min late." */
  rest?: string;
}) {
  const t = makeT(lang);
  const frac = simpleFraction(pct);
  const whole = pct > 0 && pct < 1 ? fmtShare1(pct, lang) : `${Math.round(pct)}${lang === "de" ? "\u00a0%" : "%"}`;
  return (
    <div className={styles.lead}>
      <SplitFlap text={whole.replace("\u00a0", "")} size={size} color={lateShareColor(pct)} label={fmtShare1(pct, lang)} />
      <p className={styles.rest}>{rest ?? t("res.leadRest")}</p>
      {frac ? <p className={styles.gloss}>{t("res.gloss", { frac: fractionText(frac[0], frac[1], lang) })}</p> : null}
      {measured !== undefined || basis ? (
        <p className={styles.exact}>
          {measured !== undefined ? t("res.exact", { pct: fmtShare1(pct, lang), n: fmtInt(measured, lang) }) : null}
          {measured !== undefined && basis ? " " : null}
          {basis}
        </p>
      ) : null}
    </div>
  );
}
