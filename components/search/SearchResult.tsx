"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SEARCH_INDEX, loadLine } from "@/lib/searchClient";
import { lineKey, unitName, weekdayExtremes, type SearchUnit } from "@/lib/searchCore";
import { fmt1, fmtDate, fmtDuration, fmtInt, fmtShare1, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { absoluteUrl, unitHref } from "@/lib/site";
import { renderResultCard } from "@/lib/shareImage";
import { LateLead } from "../LateLead";
import { ShareButton } from "../ShareButton";
import styles from "./SearchResult.module.css";

export function kindLabel(u: SearchUnit, lang: Lang): string {
  return makeT(lang)(`res.kind.${u.kind}` as Key);
}

export function routeText(u: SearchUnit): string {
  return `${u.origin} ${u.kind === 1 ? "↔" : "→"} ${u.dest}`;
}

function shareUrl(u: SearchUnit, lang: Lang): string {
  if (u.slug) return absoluteUrl(unitHref({ category: u.kind === 0 ? "longDistance" : "regional", slug: u.slug }, lang));
  const p = new URLSearchParams({ q: unitName(u) });
  if (u.kind !== 0) p.set("u", u.key);
  return absoluteUrl(`${route(lang, "home")}?${p.toString()}`);
}

function Weekdays({ unit, lang }: { unit: SearchUnit; lang: Lang }) {
  const t = makeT(lang);
  const { searchMinWeekdayRuns } = SEARCH_INDEX.params;
  const values = unit.weekday;
  const ext = weekdayExtremes(values);
  const top = Math.max(1, ...values.map((v) => v ?? 0));
  const lateText = (v: number) => (v < 0 ? t("res.early", { x: fmt1(-v, lang) }) : t("res.late", { x: fmt1(v, lang) }));
  const wd = (i: number) => t(`wd.${i}` as Key);
  const described = values.map((v, i) => `${wd(i)} ${v === null ? t("res.daysNoData") : lateText(v)}`).join(", ");
  return (
    <section className={styles.days} aria-labelledby="days-title">
      <h4 id="days-title" className={styles.h}>
        {t("res.days")}
      </h4>
      <p className={styles.text}>
        {ext
          ? t("res.daysText", {
              worst: wd(ext.worst),
              worstAvg: lateText(values[ext.worst] as number),
              best: wd(ext.best),
              bestAvg: lateText(values[ext.best] as number),
            })
          : t("res.daysTooFew")}
      </p>
      <div className={styles.bars} role="img" aria-label={t("res.daysAria", { list: described })}>
        {values.map((v, i) => (
          <div key={i} className={styles.day} aria-hidden="true">
            <span className={styles.dayValue}>{v === null ? "–" : fmt1(v, lang)}</span>
            <span className={styles.dayTrack}>
              <span
                className={`${styles.dayBar} ${ext && ext.worst === i ? styles.dayWorst : ""}`}
                style={{ height: v === null ? 0 : `${Math.max(4, Math.round((Math.max(v, 0) / top) * 100))}%` }}
              />
            </span>
            <span className={styles.dayName}>{t(`wds.${i}` as Key)}</span>
          </div>
        ))}
      </div>
      <p className={styles.fine}>{t("res.daysFine", { n: searchMinWeekdayRuns })}</p>
    </section>
  );
}

export function SearchResult({
  unit,
  lang,
  onOpenLine,
}: {
  unit: SearchUnit;
  lang: Lang;
  onOpenLine: (q: string, key: string) => void;
}) {
  const t = makeT(lang);
  const { window: win, params } = SEARCH_INDEX;
  const span = spanLabel(win.firstMonth, win.lastMonth, lang);
  const name = unitName(unit);
  const few = unit.measured < params.searchFewRuns;
  const [line, setLine] = useState<SearchUnit | null>(null);
  const [imageStatus, setImageStatus] = useState("");

  useEffect(() => {
    let current = true;
    setLine(null);
    loadLine(unit).then((l) => current && setLine(l), () => undefined);
    return () => {
      current = false;
    };
  }, [unit]);

  const lateText = unit.avg < 0 ? t("res.early", { x: fmt1(-unit.avg, lang) }) : t("res.late", { x: fmt1(unit.avg, lang) });
  const shareText = t("res.shareText", {
    name,
    route: routeText(unit),
    late: lateText,
    pct: fmtShare1(unit.late, lang),
    canc: fmtShare1(unit.cancelled, lang),
    span,
  });

  async function saveImage() {
    setImageStatus(t("res.making"));
    try {
      const blob = await renderResultCard(unit, { kind: kindLabel(unit, lang), span, lang });
      const file = new File([blob], `${unit.key}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareText, url: shareUrl(unit, lang) });
          setImageStatus("");
          return;
        } catch (err) {
          if ((err as DOMException).name === "AbortError") {
            setImageStatus("");
            return;
          }
        }
      }
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${unit.key}-delays.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setImageStatus(t("res.saved"));
    } catch {
      setImageStatus(t("res.saveFail"));
    }
  }

  const fullHref = unit.slug ? unitHref({ category: unit.kind === 0 ? "longDistance" : "regional", slug: unit.slug }, lang) : null;

  return (
    <article className={styles.card} aria-labelledby="result-name">
      <p className={styles.kicker}>
        <span className={styles.chip}>{kindLabel(unit, lang)}</span>
      </p>
      <h3 id="result-name" className={styles.name}>
        {name}
      </h3>
      <p className={styles.route}>{routeText(unit)}</p>
      {unit.kind === 2 && unit.line ? (
        <p className={styles.lineNote}>
          {t("res.runsOn")}{" "}
          {unit.lineHash ? (
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                const [type, num] = (unit.line as string).split(" ");
                onOpenLine(unit.line as string, lineKey(type, num, unit.lineHash as string));
              }}
            >
              {unit.line}
            </button>
          ) : (
            unit.line
          )}
          {line ? `, ${routeText(line)}` : ""}.
        </p>
      ) : null}

      <div className={styles.leadWrap}>
        <LateLead pct={unit.late} measured={unit.measured} lang={lang} basis={t("res.basis", { span })} />
      </div>

      {few ? <p className={styles.warning}>{t("res.few", { n: fmtInt(unit.measured, lang), min: params.searchMinRuns, fewMin: params.searchFewRuns })}</p> : null}

      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>{t("res.avg")}</dt>
          <dd>{fmt1(Math.abs(unit.avg), lang)}</dd>
          <dd className={styles.tileNote}>{unit.avg < 0 ? t("res.early", { x: "" }).trim() : t("res.late", { x: "" }).trim()}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{t("res.cancelled")}</dt>
          <dd>{fmtShare1(unit.cancelled, lang)}</dd>
          <dd className={styles.tileNote}>{t("res.cancelledNote", { n: fmtInt(unit.runs, lang) })}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{t("res.worst")}</dt>
          <dd>{fmtDuration(unit.worst.delay)}</dd>
          <dd className={styles.tileNote}>{fmtDate(unit.worst.date, lang)}</dd>
        </div>
      </dl>
      {unit.worst.origin && unit.worst.dest ? (
        <p className={styles.fine}>{t("res.worstRoute", { o: unit.worst.origin, d: unit.worst.dest })}</p>
      ) : null}

      <Weekdays unit={unit} lang={lang} />

      <div className={styles.actions}>
        <ShareButton lang={lang} title={`${name} · German Punctuality`} text={shareText} url={shareUrl(unit, lang)} label={t("res.shareLabel")}>
          <button type="button" className={styles.imageButton} onClick={saveImage}>
            {t("res.save")}
          </button>
        </ShareButton>
        {imageStatus ? (
          <p className={styles.status} role="status">
            {imageStatus}
          </p>
        ) : null}
        {fullHref ? (
          <Link className={styles.full} href={fullHref} prefetch={false}>
            {unit.kind === 0 ? t("res.fullTrain") : t("res.fullLine")} <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>
    </article>
  );
}
