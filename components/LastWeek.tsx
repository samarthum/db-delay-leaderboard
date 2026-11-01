"use client";

import { useEffect, useState } from "react";
import { LATE, liveColor } from "@/lib/colors";
import { fmtDate } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { daysSince, loadTrainWeek, summarise, weekdayOf, type Day, type End, type TrainWeek, type WeekIndex } from "@/lib/last7";
import { shortStation } from "@/lib/routeSlug";
import { makeT, type Key, type T } from "@/lib/t";

/** "Sat 24" / "Sa 24" over a day column. */
function dayHead(iso: string, t: T, lang: Lang) {
  return { wd: t(`wds.${weekdayOf(iso)}` as Key), d: `${Number(iso.slice(8, 10))}${lang === "de" ? "." : ""}` };
}

/** One end of one day: what the mark shows, the number under it and what a screen reader hears. */
function endOf(day: Day, which: 0 | 1, t: T): { kind: "min" | "canc" | "none" | "gap" | "unmeasured" | "elsewhere"; n?: number; text: string; sr: string } {
  if (day === null) return { kind: "none", text: "–", sr: t("wk.sr.noRun") };
  if (day === "?") return { kind: "gap", text: "?", sr: t("wk.sr.gap") };
  // The red mark carries the ×; the number line under it stays empty.
  if (day === "x") return { kind: "canc", text: "\u00a0", sr: t("wk.sr.canc") };
  const v: End = day[which];
  // * : that day this end was another station (named under the table).
  const star = day.length > 2 && day[2 + which] ? "*" : "";
  if (v === "x") return { kind: "canc", text: star || "\u00a0", sr: t("wk.sr.canc") };
  if (v === null) return { kind: "unmeasured", text: "–" + star, sr: t("wk.sr.unmeasured") };
  const n = Math.max(0, v);
  const sr = n > 0 ? t("wk.sr.late", { n }) : t("live.onTime");
  // Measured at another station than the row names: shown, but drawn as not counted (hollow, grey number).
  if (star) return { kind: "elsewhere", n, text: String(n) + star, sr: `${sr}, ${(day as [End, End, string | null, string | null])[2 + which]}` };
  return { kind: "min", n, text: String(n), sr };
}

function Row({ cells, which, label, days, t, lang }: { cells: Day[]; which: 0 | 1; label: string; days: string[]; t: T; lang: Lang }) {
  return (
    <>
      <tr className="wk-label">
        <th colSpan={days.length} scope="colgroup">
          {label}
        </th>
      </tr>
      <tr className="wk-marks">
        {cells.map((c, i) => {
          const e = endOf(c, which, t);
          const color = e.kind === "min" ? liveColor(e.n) : e.kind === "canc" ? LATE : undefined;
          const h = dayHead(days[i], t, lang);
          return (
            <td key={days[i]} className={`wk-cell wk-${e.kind}`}>
              <span className="wk-mark" style={color ? { ["--c" as string]: color } : undefined} aria-hidden="true">
                {e.kind === "canc" ? (
                  <svg viewBox="0 0 10 10" width="10" height="10">
                    <path d="M2 2 8 8M8 2 2 8" stroke="#fff" strokeWidth="1.8" />
                  </svg>
                ) : null}
              </span>
              <span className="wk-v" aria-hidden="true">
                {e.text}
              </span>
              <span className="visually-hidden">
                {h.wd} {h.d}: {e.sr}
              </span>
            </td>
          );
        })}
      </tr>
    </>
  );
}

/**
 * "The last 7 days" on a train page and on the search result card: one mark per day at departure (first German stop)
 * and at arrival (last German stop), from the daily job (scripts/last7.py). Colour only for data, on the live scale
 * (grey nothing reported, olive under 6, amber 6-14, red 15+ and cancelled); no run and incomplete days are hollow and
 * never read as fine. Renders nothing until the site has the data.
 */
export function LastWeek({ train, lang }: { train: string; lang: Lang }) {
  const t = makeT(lang);
  const [data, setData] = useState<{ index: WeekIndex; week: TrainWeek | undefined } | null>(null);
  const [age, setAge] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    loadTrainWeek(train).then(
      (r) => {
        if (!alive || !r) return;
        setData(r);
        setAge(daysSince(r.index.asOf));
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [train]);
  if (!data) return null;
  const stale = age > 3;
  const { index, week } = data;
  const first = fmtDate(index.days[0], lang).replace(/\s\d{4}$/, "");
  const firstWd = `${t(`wds.${weekdayOf(index.days[0])}` as Key)}${lang === "de" ? "," : ""} ${first}`;
  const last = fmtDate(index.asOf, lang).replace(/\s\d{4}$/, "");
  const asOf = `${t(`wds.${weekdayOf(index.asOf)}` as Key)}${lang === "de" ? "," : ""} ${last}`;
  const head = (
    <h3 className="wk-h" id={`wk-${train.replace(/\s/g, "-")}`}>
      {t("wk.title")}
    </h3>
  );
  if (!week) {
    return (
      <section className="wk" aria-label={t("wk.title")}>
        {head}
        <p className="wk-sum">{t("wk.noRun", { train, first: firstWd, last: asOf })}</p>
      </section>
    );
  }
  const s = summarise(week.c);
  const dest = week.d ? shortStation(week.d) : "";
  const origin = week.o ? shortStation(week.o) : "";
  const avg = s.arrAvg === null ? "" : Math.round(s.arrAvg) >= 1 ? t("wk.avg", { n: Math.round(s.arrAvg) }) : t("wk.avgUnder");
  const one = Math.max(0, Math.round(s.arrAvg ?? 0));
  const sum =
    !dest
      ? ""
      : s.arrDays === 0
        ? t("wk.sumNone", { st: dest })
        : s.arrDays === 1
          ? one > 0
            ? t("wk.sum1", { st: dest, n: one })
            : t("wk.sum1On", { st: dest })
          : t(s.late15 === 0 ? "wk.sum0" : "wk.sum", { st: dest, avg, k: s.late15, n: s.arrDays });
  const canc = s.cancelled === 0 ? "" : s.cancelled === 1 ? t("wk.canc1") : t("wk.cancN", { n: s.cancelled });
  // Days that started or ended somewhere else than usual: said under the diagram, never hidden.
  const other: string[] = [];
  week.c.forEach((c, i) => {
    if (!Array.isArray(c) || c.length <= 2) return;
    const x = c as [End, End, string | null, string | null];
    const h = dayHead(index.days[i], t, lang);
    const day = `${h.wd} ${h.d}`;
    if (x[2] && origin) other.push(t("wk.otherStart", { day, st: shortStation(x[2]), usual: origin }));
    if (x[3] && dest) other.push(t("wk.otherEnd", { day, st: shortStation(x[3]), usual: dest }));
  });
  return (
    <section className="wk" aria-labelledby={`wk-${train.replace(/\s/g, "-")}`}>
      {head}
      <p className={stale ? "wk-asof wk-stale" : "wk-asof"}>{t(stale ? "wk.asOfStale" : "wk.asOf", { first: firstWd, date: asOf, n: age })}</p>
      <p className="wk-sum">
        {sum}
        {canc ? ` ${canc}` : ""}
      </p>
      <table className="wk-table">
        <caption className="visually-hidden">{t("wk.caption", { train, first, last })}</caption>
        <thead>
          <tr>
            {index.days.map((d) => {
              const h = dayHead(d, t, lang);
              return (
                <th key={d} scope="col" className="wk-day">
                  <span>{h.wd}</span> {h.d}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <Row cells={week.c} which={0} label={origin ? t("wk.dep", { st: origin }) : t("live.dep")} days={index.days} t={t} lang={lang} />
          <Row cells={week.c} which={1} label={dest ? t("wk.arr", { st: dest }) : t("live.arr")} days={index.days} t={t} lang={lang} />
        </tbody>
      </table>
      {other.length ? <p className="wk-fine">{t("wk.other", { list: other.join("; ") })}</p> : null}
      <p className="wk-key" aria-hidden="true">
        <span className="wk-k">
          {t("wk.key.min")}
          {([[20, "15+"], [8, "6–14"], [3, "1–5"], [0, "0"]] as const).map(([v, l]) => (
            <span key={l} className="wk-sw">
              <span className="wk-mark wk-km" style={{ ["--c" as string]: liveColor(v) }} />
              {l}
            </span>
          ))}
          <span>{t("wk.key.zero")}</span>
        </span>
        <span className="wk-k">
          <span className="wk-mark wk-km" style={{ ["--c" as string]: LATE }}>
            <svg viewBox="0 0 10 10" width="8" height="8">
              <path d="M2 2 8 8M8 2 2 8" stroke="#fff" strokeWidth="1.8" />
            </svg>
          </span>{" "}
          {t("wk.key.canc")}
        </span>
        <span className="wk-k wk-kh">
          <span className="wk-mark wk-km wk-hollow" />
          <span>{t("wk.key.none")}</span>
        </span>
      </p>
      {origin && dest ? <p className="wk-fine">{t("wk.note", { o: origin, d: dest, fold: t("own.toggle") })}</p> : null}
    </section>
  );
}
