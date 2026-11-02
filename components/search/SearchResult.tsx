"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SEARCH_INDEX, loadLine, loadStops } from "@/lib/searchClient";
import { latestMonth, lineKey, unitName, weekdayExtremes, type SearchUnit } from "@/lib/searchCore";
import { fmt1, fmtDate, fmtDuration, fmtInt, fmtShare1, monthLong, spanLabel } from "@/lib/format";
import { route, type Lang } from "@/lib/i18n";
import { makeT, type Key } from "@/lib/t";
import { absoluteUrl, portraitPath, unitHref } from "@/lib/site";
import { Arrow } from "../Arrow";
import { foreignOrigin, shownOrigin } from "@/lib/origins";
import { Figure } from "../Figure";
import { LiveNow } from "../LiveNow";
import { TripOrLive } from "../TripEnds";
import { SaveButton } from "../SaveButton";
import { OwnStops } from "../OwnStops";
import { LastWeek } from "../LastWeek";
import { remember } from "@/lib/recent";
import { Rich } from "../Rich";
import { ShareButton } from "../ShareButton";
import { shortStation } from "@/lib/routeSlug";
import styles from "./SearchResult.module.css";

export function kindLabel(u: SearchUnit, lang: Lang): string {
  return makeT(lang)(`res.kind.${u.kind}` as Key);
}

export function routeText(u: SearchUnit): string {
  const o = u.kind === 0 ? shownOrigin(unitName(u), u.origin) : u.origin;
  return `${shortStation(o)} ${u.kind === 1 ? "↔" : "→"} ${shortStation(u.dest)}`;
}

function shareUrl(u: SearchUnit, lang: Lang): string {
  if (u.slug) return absoluteUrl(unitHref({ category: u.kind === 0 ? "longDistance" : "regional", slug: u.slug }, lang));
  const p = new URLSearchParams({ q: unitName(u) });
  if (u.kind !== 0) p.set("u", u.key);
  return absoluteUrl(`${route(lang, "home")}?${p.toString()}`);
}

/** Monday = 0 ... Sunday = 6, for today in Berlin. */
export function berlinWeekday(): number {
  const wd = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short" }).format(new Date());
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
}

function Weekdays({ unit, lang, today }: { unit: SearchUnit; lang: Lang; today: number }) {
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
            <span className={`${styles.dayName} ${i === today ? styles.dayToday : ""}`}>{t(`wds.${i}` as Key)}</span>
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
  const [today, setToday] = useState(-1);
  // Trains that end abroad: our figures stop at the last German stop, and live times may stop earlier still.
  const [abroadEnd, setAbroadEnd] = useState(false);
  useEffect(() => {
    let on = true;
    setAbroadEnd(false);
    if (unit.kind === 0) loadStops().then((idx) => on && setAbroadEnd(idx.raw.foreign.includes(unit.dest)), () => undefined);
    return () => {
      on = false;
    };
  }, [unit]);
  useEffect(() => setToday(berlinWeekday()), []);
  const ownHref = `${route(lang, "home")}?${new URLSearchParams(unit.kind === 0 ? { q: name } : { q: name, u: unit.key }).toString()}`;
  // Long-distance trains without a page of their own go on "Looked up lately" on the home page (pages do this themselves).
  useEffect(() => {
    if (unit.slug) return;
    remember(lang, { href: ownHref, title: name, sub: routeText(unit), value: t("list.avg", { x: fmt1(Math.max(0, unit.avg), lang) }), live: unit.kind === 0 ? name : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownHref, lang]);

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

  // "How has it been lately": the same line as the train page (latest month of the window, enough runs).
  const latest = latestMonth(unit, win.lastMonth);

  const fullHref = unit.slug ? unitHref({ category: unit.kind === 0 ? "longDistance" : "regional", slug: unit.slug }, lang) : null;

  return (
    <article className={styles.card} aria-labelledby="result-name">
      <p className={styles.kicker}>{kindLabel(unit, lang)}</p>
      <div className={styles.titleRow}>
        <h3 id="result-name" className={styles.name}>
          {name}
        </h3>
        <SaveButton lang={lang} item={{ kind: "train", href: fullHref ?? ownHref, title: name, sub: routeText(unit), avg: unit.avg, live: unit.kind === 0 ? name : undefined }} words />
      </div>
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

      {unit.kind === 0 && foreignOrigin(name) ? (
        <p className={styles.lineNote}>{t("res.fromBorder", { origin: shortStation(foreignOrigin(name)!.origin), border: shortStation(foreignOrigin(name)!.border) })}</p>
      ) : null}
      {abroadEnd ? <p className={styles.fineNote}>{t("res.toBorder", { dest: shortStation(unit.dest) })}</p> : null}
      {unit.kind === 0 ? (
        <TripOrLive
          train={name}
          lang={lang}
          fallback={<LiveNow train={name} lang={lang} quiet dest={abroadEnd ? shortStation(unit.dest) : undefined} origin={foreignOrigin(name) ? undefined : shortStation(unit.origin)} />}
        />
      ) : null}
      {unit.kind === 0 ? <OwnStops train={name} lang={lang} /> : null}
      {unit.kind === 0 ? <LastWeek train={name} lang={lang} /> : null}

      <h4 className={styles.past}>{t("res.past", { span })}</h4>
      <div className={styles.leadWrap}>
        <Figure
          avg={unit.avg}
          pct={unit.late}
          pct6={unit.late6}
          lang={lang}
          sentence={<Rich text={t(abroadEnd ? "fig.unitAbroad" : "fig.unit")} />}
          basis={t("home.networkBasis", { trips: fmtInt(unit.measured, lang), span })}
        />
      </div>
      {latest ? (
        <p className="lately">
          {t("res.lately", { month: monthLong(latest.month, lang), late: t(latest.avg < 0 ? "res.early" : "res.late", { x: fmt1(Math.abs(latest.avg), lang) }) })}
        </p>
      ) : null}

      {today >= 0 && unit.weekday[today] !== null ? (
        <p className={styles.today}>
          {t("res.today", {
            days: t(`wdp.${today}` as Key),
            late: (unit.weekday[today] as number) < 0 ? t("res.early", { x: fmt1(-(unit.weekday[today] as number), lang) }) : t("res.late", { x: fmt1(unit.weekday[today] as number, lang) }),
          })}
        </p>
      ) : null}

      {few ? <p className={styles.warning}>{t("res.few", { n: fmtInt(unit.measured, lang), min: params.searchMinRuns, fewMin: params.searchFewRuns })}</p> : null}

      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>{t("res.cancPast")}</dt>
          <dd>{unit.cancelled === 0 ? t("res.cancNone") : fmtShare1(unit.cancelled, lang)}</dd>
          <dd className={styles.tileNote}>{t("res.cancelledNote", { n: fmtInt(unit.runs, lang) })}</dd>
        </div>
        <div className={styles.tile}>
          <dt>{t("res.worst")}</dt>
          <dd>{fmtDuration(unit.worst.delay, lang)}</dd>
          <dd className={styles.tileNote}>{fmtDate(unit.worst.date, lang)}</dd>
        </div>
      </dl>
      {unit.worst.origin && unit.worst.dest ? (
        <p className={styles.fine}>{t("res.worstRoute", { o: unit.worst.origin, d: unit.worst.dest })}</p>
      ) : null}

      <Weekdays unit={unit} lang={lang} today={today} />

      <div className="actions">
        <ShareButton lang={lang} title={`${name} · German Punctuality`} text={shareText} url={shareUrl(unit, lang)} label={t("res.shareLabel")} image={unit.slug ? portraitPath(win.lastMonth, unit.slug, lang) : line?.slug ? portraitPath(win.lastMonth, line.slug, lang) : undefined} filename={unit.slug ?? line?.slug ?? "german-punctuality"} />
        {fullHref ? (
          <Link className="tl" href={fullHref} prefetch={false}>
            {unit.kind === 0 ? t("res.fullTrain") : t("res.fullLine")} <Arrow />
          </Link>
        ) : null}
      </div>
    </article>
  );
}
