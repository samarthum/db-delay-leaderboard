"use client";

import { useId, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { makeT } from "@/lib/t";
import s from "./Compensation.module.css";

const MAX_MIN = 180;
/** DB pays nothing below this (its conditions of carriage). */
const MIN_PAYOUT = 4;

function euro(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-IE", { style: "currency", currency: "EUR" }).format(n);
}

/**
 * "How much do you get?": what you paid + how late you reached the station on your ticket -> the amount. The ruler under
 * the slider is the rule itself: nothing below 60 minutes, 25% from 60, 50% from 120.
 */
export function CompCalc({ lang }: { lang: Lang }) {
  const t = makeT(lang);
  const id = useId();
  const [paid, setPaid] = useState("80");
  const [late, setLate] = useState(75);
  const [ret, setRet] = useState(false);
  const price = Math.max(0, Number(paid.replace(",", ".")) || 0);
  const base = ret ? price / 2 : price;
  const share = late >= 120 ? 0.5 : late >= 60 ? 0.25 : 0;
  const amount = Math.round(base * share * 100) / 100;
  const zone = late >= 120 ? "z120" : late >= 60 ? "z60" : "z0";
  const pct = (m: number) => `${(100 * m) / MAX_MIN}%`;

  return (
    <section className={s.calc} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={s.h2}>
        {t("comp2.calc.title")}
      </h2>

      <label className={s.field} htmlFor={`${id}-paid`}>
        <span>{t("comp2.calc.paid")}</span>
        <span className={s.money}>
          <span aria-hidden="true">€</span>
          <input
            id={`${id}-paid`}
            inputMode="decimal"
            value={paid}
            onChange={(e) => setPaid(e.target.value.replace(/[^\d.,]/g, "").slice(0, 7))}
            onFocus={(e) => e.target.select()}
          />
        </span>
      </label>

      <div className={s.field} style={{ display: "block" }}>
        <label htmlFor={`${id}-late`} className={s.lateHead}>
          <span>{t("comp2.calc.late")}</span>
          <b>{late >= MAX_MIN ? t("comp2.calc.minutesMore", { n: MAX_MIN }) : t("comp2.calc.minutes", { n: late })}</b>
        </label>
        <div className={s.ruler}>
          <div className={s.zones} aria-hidden="true">
            <i className={s.z0} style={{ width: pct(60) }} />
            <i className={s.z60} style={{ width: pct(60) }} />
            <i className={s.z120} style={{ width: pct(60) }} />
          </div>
          <input
            id={`${id}-late`}
            type="range"
            min={0}
            max={MAX_MIN}
            step={5}
            value={late}
            onChange={(e) => setLate(Number(e.target.value))}
            className={s.range}
          />
          <div className={s.ticks} aria-hidden="true">
            <span style={{ left: 0 }}>0</span>
            <span style={{ left: pct(60) }}>{t("comp2.unit", { n: 60 })}</span>
            <span style={{ left: pct(120) }}>{t("comp2.unit", { n: 120 })}</span>
            <span style={{ left: "100%" }}>{MAX_MIN}+</span>
          </div>
        </div>
      </div>

      <label className={s.check}>
        <input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} />
        <span>
          {t("comp2.calc.return")}
          <small>{t("comp2.calc.returnHint")}</small>
        </span>
      </label>

      <div className={`${s.result} ${s[zone]}`} role="status" aria-live="polite">
        {share === 0 ? (
          <p className={s.resNone}>{t("comp2.calc.none")}</p>
        ) : amount < MIN_PAYOUT ? (
          <p className={s.resNone}>{t("comp2.calc.small", { amount: euro(amount, lang) })}</p>
        ) : (
          <>
            <p className={s.resLabel}>{t("comp2.calc.get")}</p>
            <p className={s.resBig}>{euro(amount, lang)}</p>
            <p className={s.resSub}>{t("comp2.calc.pct", { pct: share === 0.5 ? "50" : "25", base: euro(base, lang) })}</p>
            <a className={s.jump} href="#claim">
              {t("comp2.calc.jump")} ↓
            </a>
          </>
        )}
      </div>
      <p className={s.fine}>{t("comp2.calc.note")}</p>
    </section>
  );
}
